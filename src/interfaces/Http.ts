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
  delete: <RES = unknown>(
    url: string,
    config?: FetchRequestConfig
  ) => Promise<FetchResponse<RES>>;
  getInstance: () => FetchClient;
}

interface FetchClient {
  get: <T>(url: string, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  post: <T>(url: string, data?: any, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  put: <T>(url: string, data?: any, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  patch: <T>(url: string, data?: any, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  delete: <T>(url: string, config?: FetchRequestConfig) => Promise<FetchResponse<T>>;
  request: <T>(config: FetchRequestConfig & { url: string }) => Promise<FetchResponse<T>>;
}

export type { Http, FetchClient };
