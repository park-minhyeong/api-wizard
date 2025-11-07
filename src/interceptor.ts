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

  // 요청 인터셉터 처리
  private async handleRequestInterceptor(config: FetchRequestConfig & { url: string }): Promise<FetchRequestConfig & { url: string }> {
    let processedConfig = { ...config };

    // 사용자 정의 요청 인터셉터
    if (this.interceptor?.onRequest) {
      processedConfig = this.interceptor.onRequest(processedConfig);
    }

    // 토큰 자동 추가
    if (this.interceptor?.tokenConfig?.getToken) {
      const token = this.interceptor.tokenConfig.getToken();
      if (token) {
        const authHeaders = createAuthHeaders(
          { fetchClient: this, config: this.interceptor.tokenConfig },
          token
        );
        
        processedConfig.headers = {
          ...processedConfig.headers,
          ...authHeaders
        };
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
    try {
      // 요청 인터셉터 적용
      const processedConfig = await this.handleRequestInterceptor(config);
      
      // 원본 요청 실행
      const originalRequest = () => super.request<T>(processedConfig);
      const response = await originalRequest();
      
      // 응답 인터셉터 적용
      return await this.handleResponseInterceptor(response);
    } catch (error) {
      // 에러 인터셉터 적용
      return this.handleErrorInterceptor(error, () => super.request<T>(config));
    }
  }
}
