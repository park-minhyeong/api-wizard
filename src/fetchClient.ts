import { FetchClient } from './interfaces/Http.js';
import { FetchParams, FetchResponse, FetchRequestConfig } from './interfaces/Fetch.js';

// Axios 호환 에러 인터페이스
interface AxiosCompatibleError extends Error {
  response?: {
    data: any;
    status: number;
    statusText: string;
    headers: any;
  };
  request?: any;
  config?: any;
  status?: number;
  _retry?: boolean;
}

// Fetch 에러 클래스 (axios 호환)
export class FetchError extends Error implements AxiosCompatibleError {
  public response?: {
    data: any;
    status: number;
    statusText: string;
    headers: any;
  };
  public request?: any;
  public config?: any;
  public status: number;
  public _retry?: boolean;

  constructor(
    status: number,
    statusText: string,
    originalResponse: Response,
    url: string,
    data?: any,
    requestConfig?: any
  ) {
    super(`HTTP Error ${status}: ${statusText}`);
    this.name = 'FetchError';
    this.status = status;
    
    // axios 호환 response 구조
    this.response = {
      data,
      status,
      statusText,
      headers: originalResponse.headers
    };
    
    // request 정보 (axios 호환)
    this.request = {
      url,
      method: requestConfig?.method || 'GET'
    };
    
    this.config = requestConfig;
  }
}

// Fetch 클라이언트 구현
export class FetchClientImpl implements FetchClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;
  private defaultConfig: RequestInit;
  private defaultValidateStatus: (status: number) => boolean;

  constructor(config?: { 
    baseURL?: string; 
    headers?: HeadersInit; 
    requestConfig?: RequestInit;
    validateStatus?: (status: number) => boolean;
  }) {
    this.baseURL = config?.baseURL || '';
    // config.headers에 Content-Type이 없으면 기본값으로 추가하지 않음
    this.defaultHeaders = config?.headers || {};
    this.defaultConfig = {
      credentials: 'include',
      ...config?.requestConfig
    };
    // 기본값: 500번대만 에러로 처리 (현재 동작 유지)
    this.defaultValidateStatus = config?.validateStatus || ((status: number) => status < 500);
  }

  // URL 생성 헬퍼
  private buildURL(url: string, params?: FetchParams): string {
    const fullURL = this.baseURL + url;
    if (!params || Object.keys(params).length === 0) {
      return fullURL;
    }
    
    // undefined, null, 빈 문자열 값들을 필터링하고 문자열로 변환
    const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>);
    
    if (Object.keys(filteredParams).length === 0) {
      return fullURL;
    }
    
    const searchParams = new URLSearchParams(filteredParams);
    return `${fullURL}?${searchParams.toString()}`;
  }

  // 헤더 병합 헬퍼
  private mergeHeaders(...headers: (HeadersInit | undefined)[]): Headers {
    const result = new Headers();
    
    headers.forEach(headerInit => {
      if (!headerInit) return;
      
      if (headerInit instanceof Headers) {
        headerInit.forEach((value, key) => result.set(key, value));
      } else if (Array.isArray(headerInit)) {
        headerInit.forEach(([key, value]) => result.set(key, value));
      } else {
        Object.entries(headerInit).forEach(([key, value]) => {
          if (value !== undefined) result.set(key, value);
        });
      }
    });
    
    return result;
  }

  // 일반 객체를 FormData로 변환하는 헬퍼
  // Node.js와 브라우저 모두에서 동작
  private objectToFormData(obj: any): FormData {
    const formData = new FormData();
    
    // File 클래스가 있는지 확인 (브라우저 또는 Node.js 18+)
    const FileClass = typeof File !== 'undefined' ? File : null;
    const BlobClass = typeof Blob !== 'undefined' ? Blob : null;
    
    const appendValue = (key: string, value: any, parentKey?: string) => {
      const formKey = parentKey ? `${parentKey}[${key}]` : key;
      
      if (value === null || value === undefined) {
        return; // null/undefined는 무시
      }
      
      // File, Blob, ArrayBuffer 등은 그대로 추가
      if (FileClass && value instanceof FileClass) {
        formData.append(formKey, value);
      } else if (BlobClass && value instanceof BlobClass) {
        formData.append(formKey, value);
      } else if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
        if (BlobClass) {
          formData.append(formKey, new BlobClass([value as BlobPart]));
        } else {
          // Blob이 없는 환경에서는 Uint8Array로 변환
          const uint8Array = new Uint8Array(value as ArrayBuffer);
          formData.append(formKey, new Blob([uint8Array as BlobPart]));
        }
      } else if (ArrayBuffer.isView(value)) {
        // TypedArray (Uint8Array 등) 처리
        const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        if (BlobClass) {
          formData.append(formKey, new BlobClass([buffer as BlobPart]));
        } else {
          const uint8Array = new Uint8Array(buffer);
          formData.append(formKey, new Blob([uint8Array as BlobPart]));
        }
      } else if (Array.isArray(value)) {
        // 배열은 각 요소를 인덱스로 추가
        value.forEach((item, index) => {
          appendValue(String(index), item, formKey);
        });
      } else if (typeof value === 'object' && value.constructor === Object) {
        // 중첩 객체는 재귀적으로 처리
        Object.keys(value).forEach(subKey => {
          appendValue(subKey, value[subKey], formKey);
        });
      } else {
        // 기본 타입 (string, number, boolean 등)은 문자열로 변환
        formData.append(formKey, String(value));
      }
    };
    
    Object.keys(obj).forEach(key => {
      appendValue(key, obj[key]);
    });
    
    return formData;
  }

  // Response를 FetchResponse로 변환 (axios 호환 에러 처리)
  private async transformResponse<T>(
    response: Response, 
    requestConfig: FetchRequestConfig & { url: string }
  ): Promise<FetchResponse<T>> {
    let data: T;
    
    const contentType = response.headers.get('content-type');
    
    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text() as unknown as T;
      }
    } catch (parseError) {
      data = null as unknown as T;
    }

    // validateStatus를 사용하여 에러 처리
    // 요청별 validateStatus가 있으면 우선 사용, 없으면 기본값 사용
    const validateStatus = requestConfig.validateStatus || this.defaultValidateStatus;
    
    // validateStatus가 false를 반환하면 에러로 throw
    if (!validateStatus(response.status)) {
      throw new FetchError(
        response.status, 
        response.statusText, 
        response, 
        response.url,
        data,
        requestConfig
      );
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      url: response.url,
      ok: response.ok
    };
  }

  // 공통 request 메서드
  async request<T>(config: FetchRequestConfig & { url: string }): Promise<FetchResponse<T>> {
    const { url, params, timeout, baseURL, ...fetchConfig } = config;
    
    const finalURL = this.buildURL(url, params);
    let headers = this.mergeHeaders(this.defaultHeaders, fetchConfig.headers);
    
    // FormData인 경우 Content-Type 헤더 제거
    // 브라우저/Node.js가 자동으로 boundary를 포함한 Content-Type 설정
    if (fetchConfig.body instanceof FormData) {
      headers = new Headers(headers);
      headers.delete('content-type');
    }
    
    const requestConfig: RequestInit = {
      ...this.defaultConfig,
      ...fetchConfig,
      headers
    };

    // 타임아웃 처리
    const controller = new AbortController();
    if (timeout) {
      setTimeout(() => controller.abort(), timeout);
    }
    requestConfig.signal = controller.signal;

    try {
      const response = await fetch(finalURL, requestConfig);
      return await this.transformResponse<T>(response, { ...config, url: finalURL });
    } catch (error) {
      if (error instanceof FetchError) {
        throw error;
      }
      
      // 네트워크 에러 (axios 호환)
      const networkError = new Error(`Network Error: ${error instanceof Error ? error.message : 'Unknown error'}`) as AxiosCompatibleError;
      networkError.request = {
        url: finalURL,
        method: requestConfig.method || 'GET'
      };
      networkError.config = { ...config, url: finalURL };
      
      throw networkError;
    }
  }

  // GET 메서드
  async get<T>(url: string, config?: FetchRequestConfig): Promise<FetchResponse<T>> {
    return this.request<T>({
      ...config,
      url,
      method: 'GET',
    });
  }

  // POST 메서드  
  async post<T>(url: string, data?: any, config?: FetchRequestConfig): Promise<FetchResponse<T>> {
    const headers = this.mergeHeaders(this.defaultHeaders, config?.headers);
    let contentType = headers.get('content-type') || '';
    
    let body: string | FormData | undefined;
    let finalHeaders = headers;
    
    if (data) {
      // FormData 감지 및 처리
      if (data instanceof FormData) {
        body = data;
        // FormData 사용 시 Content-Type 헤더 제거
        // 브라우저/Node.js가 자동으로 boundary를 포함한 Content-Type 설정
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('multipart/form-data')) {
        // multipart/form-data로 설정된 경우 일반 객체를 FormData로 자동 변환
        body = this.objectToFormData(data);
        // FormData 사용 시 Content-Type 헤더 제거
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        // form-urlencoded인 경우 그대로 전달 (이미 URLSearchParams.toString()으로 처리됨)
        body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
      } else {
        // JSON 데이터 처리 (기본값)
        body = JSON.stringify(data);
        // Content-Type이 지정되지 않았으면 기본값으로 application/json 설정
        if (!contentType) {
          finalHeaders = new Headers(headers);
          finalHeaders.set('content-type', 'application/json');
        }
      }
    }
    
    return this.request<T>({
      ...config,
      url,
      method: 'POST',
      body,
      headers: finalHeaders,
    });
  }

  // PUT 메서드
  async put<T>(url: string, data?: any, config?: FetchRequestConfig): Promise<FetchResponse<T>> {
    const headers = this.mergeHeaders(this.defaultHeaders, config?.headers);
    let contentType = headers.get('content-type') || '';
    
    let body: string | FormData | undefined;
    let finalHeaders = headers;
    
    if (data) {
      // FormData 감지 및 처리
      if (data instanceof FormData) {
        body = data;
        // FormData 사용 시 Content-Type 헤더 제거
        // 브라우저/Node.js가 자동으로 boundary를 포함한 Content-Type 설정
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('multipart/form-data')) {
        // multipart/form-data로 설정된 경우 일반 객체를 FormData로 자동 변환
        body = this.objectToFormData(data);
        // FormData 사용 시 Content-Type 헤더 제거
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
      } else {
        // JSON 데이터 처리 (기본값)
        body = JSON.stringify(data);
        // Content-Type이 지정되지 않았으면 기본값으로 application/json 설정
        if (!contentType) {
          finalHeaders = new Headers(headers);
          finalHeaders.set('content-type', 'application/json');
        }
      }
    }
    
    return this.request<T>({
      ...config,
      url,
      method: 'PUT',
      body,
      headers: finalHeaders,
    });
  }

  // PATCH 메서드
  async patch<T>(url: string, data?: any, config?: FetchRequestConfig): Promise<FetchResponse<T>> {
    const headers = this.mergeHeaders(this.defaultHeaders, config?.headers);
    let contentType = headers.get('content-type') || '';
    
    let body: string | FormData | undefined;
    let finalHeaders = headers;
    
    if (data) {
      // FormData 감지 및 처리
      if (data instanceof FormData) {
        body = data;
        // FormData 사용 시 Content-Type 헤더 제거
        // 브라우저/Node.js가 자동으로 boundary를 포함한 Content-Type 설정
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('multipart/form-data')) {
        // multipart/form-data로 설정된 경우 일반 객체를 FormData로 자동 변환
        body = this.objectToFormData(data);
        // FormData 사용 시 Content-Type 헤더 제거
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
      } else {
        // JSON 데이터 처리 (기본값)
        body = JSON.stringify(data);
        // Content-Type이 지정되지 않았으면 기본값으로 application/json 설정
        if (!contentType) {
          finalHeaders = new Headers(headers);
          finalHeaders.set('content-type', 'application/json');
        }
      }
    }
    
    return this.request<T>({
      ...config,
      url,
      method: 'PATCH',
      body,
      headers: finalHeaders,
    });
  }

  // DELETE 메서드 (body 지원)
  async delete<T>(url: string, dataOrConfig?: any, config?: FetchRequestConfig): Promise<FetchResponse<T>> {
    // 하위 호환성 유지를 위해 두 번째 인자가 config인지 data인지 판별
    let data: any | undefined;
    let finalConfig: FetchRequestConfig | undefined;

    const looksLikeConfig = (value: any): value is FetchRequestConfig => {
      if (!value || typeof value !== 'object') return false;
      const possibleKeys = ['headers', 'params', 'timeout', 'baseURL', 'method', 'body', 'signal', 'validateStatus', 'credentials'];
      return possibleKeys.some((key) => key in value);
    };

    if (config !== undefined) {
      // delete(url, data, config)
      data = dataOrConfig;
      finalConfig = config;
    } else if (looksLikeConfig(dataOrConfig)) {
      // 기존 패턴: delete(url, config)
      data = undefined;
      finalConfig = dataOrConfig;
    } else {
      // 신규 패턴: delete(url, data)
      data = dataOrConfig;
      finalConfig = undefined;
    }

    const headers = this.mergeHeaders(this.defaultHeaders, finalConfig?.headers);
    let contentType = headers.get('content-type') || '';

    let body: string | FormData | undefined;
    let finalHeaders = headers;

    if (data) {
      // FormData 감지 및 처리
      if (data instanceof FormData) {
        body = data;
        // FormData 사용 시 Content-Type 헤더 제거
        // 브라우저/Node.js가 자동으로 boundary를 포함한 Content-Type 설정
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('multipart/form-data')) {
        // multipart-form-data로 설정된 경우 일반 객체를 FormData로 자동 변환
        body = this.objectToFormData(data);
        // FormData 사용 시 Content-Type 헤더 제거
        finalHeaders = new Headers(headers);
        finalHeaders.delete('content-type');
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
      } else {
        // JSON 데이터 처리 (기본값)
        body = JSON.stringify(data);
        // Content-Type이 지정되지 않았으면 기본값으로 application/json 설정
        if (!contentType) {
          finalHeaders = new Headers(headers);
          finalHeaders.set('content-type', 'application/json');
        }
      }
    }

    return this.request<T>({
      ...finalConfig,
      url,
      method: 'DELETE',
      body,
      headers: finalHeaders,
    });
  }
} 