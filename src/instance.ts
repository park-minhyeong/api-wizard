import { FetchClientImpl } from "./fetchClient.js";
import { InterceptedFetchClient } from "./interceptor.js";
import { Http, Option, FetchRequestConfig } from "./interfaces/index.js";
import { fetchRequestConfig, createFetchDefaults } from "./config.js";

function instance(baseUrl: string, option?: Option): Http {
  const fetchDefaults = createFetchDefaults({
    baseUrl,
    option,
  });
  
  const commonConfig = {
    baseURL: fetchDefaults.baseURL,
    headers: fetchDefaults.headers,
    requestConfig: {
      credentials: fetchDefaults.credentials,
      ...fetchRequestConfig
    },
    validateStatus: option?.validateStatus
  };
  
  // 인터셉터가 있으면 InterceptedFetchClient, 없으면 기본 FetchClientImpl 사용
  const fetchInstance = option?.interceptor 
    ? new InterceptedFetchClient({
        ...commonConfig,
        interceptor: option.interceptor
      })
    : new FetchClientImpl(commonConfig);
  
  return {
    get: <RES>(url: string, config?: FetchRequestConfig) =>
      fetchInstance.get<RES>(url, { ...fetchRequestConfig, ...config }),
    post: <REQ, RES>(url: string, data?: REQ, config?: FetchRequestConfig) =>
      fetchInstance.post<RES>(url, data, { ...fetchRequestConfig, ...config }),
    put: <REQ, RES>(url: string, data?: REQ, config?: FetchRequestConfig) =>
      fetchInstance.put<RES>(url, data, { ...fetchRequestConfig, ...config }),
    patch: <REQ, RES>(url: string, data?: REQ, config?: FetchRequestConfig) =>
      fetchInstance.patch<RES>(url, data, { ...fetchRequestConfig, ...config }),
    delete: <RES>(url: string, config?: FetchRequestConfig) =>
      fetchInstance.delete<RES>(url, { ...fetchRequestConfig, ...config }),
    getInstance: () => fetchInstance
  };
}

export default instance;
