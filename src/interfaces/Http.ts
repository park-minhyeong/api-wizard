import { FetchRequestConfig, FetchResponse } from "./Fetch.js";

interface Http {
  get: <RES = unknown>(
    url: string,
    config?: FetchRequestConfig
  ) => Promise<FetchResponse<RES>>;
  post: <REQ = any, RES = unknown>(
    url: string,
    data?: REQ,
    config?: FetchRequestConfig
  ) => Promise<FetchResponse<RES>>;
  put: <REQ = any, RES = unknown>(
    url: string,
    data?: REQ,
    config?: FetchRequestConfig
  ) => Promise<FetchResponse<RES>>;
  patch: <REQ = any, RES = unknown>(
    url: string,
    data?: REQ,
    config?: FetchRequestConfig
  ) => Promise<FetchResponse<RES>>;
  // 하위 호환성 + body 지원을 위한 오버로드
  delete: {
    // 기존 시그니처: data 없이 config만 전달
    <RES = unknown>(
      url: string,
      config?: FetchRequestConfig
    ): Promise<FetchResponse<RES>>;
    // 신규 시그니처: data + config 전달
    <REQ = any, RES = unknown>(
      url: string,
      data?: REQ,
      config?: FetchRequestConfig
    ): Promise<FetchResponse<RES>>;
  };
  getInstance: () => FetchClient;
}

interface FetchClient {
  get: <T>(url: string, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  post: <T>(url: string, data?: any, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  put: <T>(url: string, data?: any, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  patch: <T>(url: string, data?: any, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  // 하위 호환성 + body 지원을 위한 오버로드
  delete: {
    <T>(url: string, config?: FetchRequestConfig): Promise<FetchResponse<T>>;
    <T>(url: string, data?: any, config?: FetchRequestConfig): Promise<FetchResponse<T>>;
  };
  request: <T>(config: FetchRequestConfig & { url: string }) => Promise<FetchResponse<T>>;
}

export type { Http, FetchClient };
