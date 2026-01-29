import { FetchClientImpl } from './fetchClient.js';
import { FetchResponse, FetchRequestConfig } from './interfaces/Fetch.js';
import { Interceptor, TokenConfig } from './interfaces/Property.js';

interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
}

interface TokenHandlerContext {
  fetchClient: FetchClientImpl;
  config: TokenConfig;
}

// 토큰 갱신 관리자
interface TokenRefreshManager {
  isRefreshing: boolean;
  waitQueue: Array<{
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }>;
}

const tokenRefreshManager: TokenRefreshManager = {
  isRefreshing: false,
  waitQueue: [],
};

// 인증 헤더 생성
const createAuthHeaders = (context: TokenHandlerContext, token: string, refreshToken?: string): Record<string, string> => {
  const { config } = context;
  return config.formatAuthHeader
    ? config.formatAuthHeader(token, refreshToken)
    : {
      Authorization: `Bearer ${token}`,
      ...(refreshToken && { refresh: refreshToken }),
    };
};

// 토큰 갱신 시도 여부 판단
const shouldAttemptRefresh = (context: TokenHandlerContext, error: any): boolean => {
  const { config } = context;
  return (
    (error.response?.status === 401 || error.status === 401) &&
    !error._retry &&
    !!config.getRefreshToken &&
    !!config.getToken &&
    !!config.refreshEndpoint
  );
};

// 토큰 갱신 수행
const performTokenRefresh = async (context: TokenHandlerContext): Promise<TokenRefreshResult> => {
  const { fetchClient, config } = context;
  const refreshToken = config.getRefreshToken?.();
  const token = config.getToken?.();
  if (!refreshToken || !token || !config.refreshEndpoint) {
    throw new Error('Missing refresh configuration');
  }
  const authHeaders = createAuthHeaders(context, token, refreshToken);
  const response = await fetchClient.post<TokenRefreshResult>(
    config.refreshEndpoint,
    {},
    { headers: authHeaders }
  );
  return response.data;
};

// 토큰 갱신 처리
const handleTokenRefresh = async (context: TokenHandlerContext, error: any, originalRequest: () => Promise<any>) => {
  if (!shouldAttemptRefresh(context, error)) {
    return Promise.reject(error);
  }

  const { config } = context;
  error._retry = true;

  if (tokenRefreshManager.isRefreshing) {
    return new Promise((resolve, reject) => {
      tokenRefreshManager.waitQueue.push({ resolve, reject });
    });
  }

  tokenRefreshManager.isRefreshing = true;

  try {
    const { accessToken, refreshToken } = await performTokenRefresh(context);
    config.setToken?.(accessToken);
    config.setRefreshToken?.(refreshToken);

    // 대기 중인 요청들 처리
    tokenRefreshManager.waitQueue.forEach(({ resolve }) => {
      resolve(originalRequest());
    });

    return originalRequest();
  } catch (refreshError) {
    config.removeToken?.();
    config.removeRefreshToken?.();
    config.onTokenExpired?.();

    tokenRefreshManager.waitQueue.forEach(({ reject }) => {
      reject(refreshError);
    });

    return Promise.reject(refreshError);
  } finally {
    tokenRefreshManager.isRefreshing = false;
    tokenRefreshManager.waitQueue = [];
  }
};

// FetchClient에 인터셉터 기능을 추가하는 클래스
export class InterceptedFetchClient extends FetchClientImpl {
  private interceptor?: Interceptor;

  constructor(config?: { 
    baseURL?: string; 
    headers?: HeadersInit; 
    requestConfig?: RequestInit;
    interceptor?: Interceptor;
    validateStatus?: (status: number) => boolean;
  }) {
    super(config);
    this.interceptor = config?.interceptor;
  }

  // HeadersList/Headers 인스턴스인지 확인하는 헬퍼
  private isHeadersInstance(headers: any): headers is Headers {
    return headers instanceof Headers || 
           (headers && typeof headers.set === 'function' && typeof headers.get === 'function');
  }

  // Headers를 안전하게 병합하는 헬퍼
  private mergeHeadersSafely(targetHeaders: HeadersInit | undefined, sourceHeaders: Record<string, string>): HeadersInit {
    // targetHeaders가 Headers 인스턴스인 경우
    if (this.isHeadersInstance(targetHeaders)) {
      const result = new Headers(targetHeaders);
      Object.entries(sourceHeaders).forEach(([key, value]) => {
        if (value !== undefined) result.set(key, value);
      });
      return result;
    }
    // 일반 객체인 경우
    return {
      ...(targetHeaders as Record<string, string> || {}),
      ...sourceHeaders
    };
  }

  // Headers를 일반 객체로 변환하는 헬퍼
  private headersToObject(headers: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  // 일반 객체를 Headers로 변환하는 헬퍼
  private convertToHeaders(headersObject: Record<string, any>): Headers {
    const newHeaders = new Headers();
    Object.entries(headersObject).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        newHeaders.set(key, String(value));
      }
    });
    return newHeaders;
  }

  // 요청 인터셉터 처리
  private async handleRequestInterceptor(config: FetchRequestConfig & { url: string }): Promise<FetchRequestConfig & { url: string }> {
    // HeadersList/Headers를 보존하기 위해 얕은 복사 사용
    let processedConfig = { ...config };
    
    // headers가 Headers 인스턴스인 경우 보존하되, onRequest에서 사용할 수 있도록 일반 객체로도 변환 가능
    const wasHeaders = this.isHeadersInstance(config.headers);
    if (wasHeaders) {
      processedConfig.headers = config.headers;
    }

    // 사용자 정의 요청 인터셉터
    if (this.interceptor?.onRequest) {
      const result = await this.interceptor.onRequest(processedConfig);
      
      // 하위 호환성: onRequest가 undefined를 반환하거나 아무것도 반환하지 않는 경우 처리
      if (result === undefined || result === null) {
        // 원본 config 사용 (하위 호환성)
        processedConfig = processedConfig;
      } else {
        processedConfig = result;
      }
      
      // ✅ 개선: 일반 객체로 변환된 경우 Headers로 자동 재변환
      if (processedConfig && 
          !this.isHeadersInstance(processedConfig.headers) && 
          processedConfig.headers && 
          typeof processedConfig.headers === 'object' &&
          !Array.isArray(processedConfig.headers)) {
        
        // 개발 모드에서만 경고 (성능 최적화)
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development' && wasHeaders) {
          console.warn(
            '[api-wizard] onRequest 인터셉터에서 Headers를 일반 객체로 변환했습니다. ' +
            '자동으로 Headers로 재변환합니다. ' +
            '성능을 위해 Headers.set() 메서드를 사용하는 것을 권장합니다.'
          );
        }
        
        // 일반 객체를 Headers로 재변환
        // 단, 원본 Headers가 있었던 경우 그 값들을 먼저 병합
        const headersObject = processedConfig.headers as Record<string, any>;
        if (wasHeaders && config.headers instanceof Headers) {
          // 원본 Headers의 모든 값을 먼저 추가
          const originalHeadersObj = this.headersToObject(config.headers);
          processedConfig.headers = this.convertToHeaders({
            ...originalHeadersObj,
            ...headersObject
          });
        } else {
          processedConfig.headers = this.convertToHeaders(headersObject);
        }
      }
    }

    // 토큰 자동 추가
    if (this.interceptor?.tokenConfig?.getToken) {
      const token = this.interceptor.tokenConfig.getToken();
      if (token) {
        const authHeaders = createAuthHeaders(
          { fetchClient: this, config: this.interceptor.tokenConfig },
          token
        );
        
        // Headers 인스턴스인 경우 set 메서드 사용, 아니면 병합
        processedConfig.headers = this.mergeHeadersSafely(processedConfig.headers, authHeaders);
      }
    }

    return processedConfig;
  }

  // 응답 인터셉터 처리
  // validateStatus에 의해서만 에러 처리가 되도록, onResponse에서 에러를 throw해도 무시
  private async handleResponseInterceptor<T>(response: FetchResponse<T>): Promise<FetchResponse<T>> {
    if (this.interceptor?.onResponse) {
      try {
        const processedResponse = await this.interceptor.onResponse(response);
        // onResponse가 응답을 반환하면 사용, 에러를 throw하면 원본 응답 반환
        return processedResponse as FetchResponse<T>;
      } catch (error) {
        // onResponse에서 에러를 throw해도 무시하고 원본 응답 반환
        // validateStatus에 의해서만 에러 처리가 됨
        return response;
      }
    }
    return response;
  }

  // 에러 인터셉터 처리
  private async handleErrorInterceptor(error: any, originalRequest: () => Promise<any>): Promise<any> {
    // 사용자 정의 에러 인터셉터
    if (this.interceptor?.onError) {
      return this.interceptor.onError(error);
    }

    // 토큰 갱신 처리
    if (this.interceptor?.tokenConfig) {
      return handleTokenRefresh(
        { fetchClient: this, config: this.interceptor.tokenConfig },
        error,
        originalRequest
      );
    }

    return Promise.reject(error);
  }

  // request 메서드 오버라이드
  async request<T>(config: FetchRequestConfig & { url: string }): Promise<FetchResponse<T>> {
    // 요청 인터셉터 적용
    const processedConfig = await this.handleRequestInterceptor(config);
    
    // 원본 요청 실행 함수 (processedConfig 사용)
    const originalRequest = () => super.request<T>(processedConfig);
    
    try {
      const response = await originalRequest();
      
      // 응답 인터셉터 적용
      return await this.handleResponseInterceptor(response);
    } catch (error) {
      // 에러 인터셉터 적용 (processedConfig를 사용하도록 수정)
      return this.handleErrorInterceptor(error, originalRequest);
    }
  }
}
