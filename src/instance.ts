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
    delete: <REQ, RES>(url: string, dataOrConfig?: REQ | FetchRequestConfig, config?: FetchRequestConfig) => {
      // 하위 호환성: delete(url, config) vs delete(url, data, config) vs delete(url, data)
      const looksLikeConfig = (value: any): value is FetchRequestConfig => {
        if (!value || typeof value !== 'object') return false;
        const possibleKeys = ['headers', 'params', 'timeout', 'baseURL', 'method', 'body', 'signal', 'validateStatus', 'credentials'];
        return possibleKeys.some((key) => key in value);
      };

      if (config !== undefined) {
        // delete(url, data, config)
        return fetchInstance.delete<RES>(url, dataOrConfig as REQ, { ...fetchRequestConfig, ...config });
      }

      if (looksLikeConfig(dataOrConfig)) {
        // 기존 패턴: delete(url, config)
        return fetchInstance.delete<RES>(url, undefined, { ...fetchRequestConfig, ...(dataOrConfig as FetchRequestConfig) });
      }

      // 신규 패턴: delete(url, data)
      return fetchInstance.delete<RES>(url, dataOrConfig as REQ, { ...fetchRequestConfig });
    },
    getInstance: () => fetchInstance
  };
}

export default instance;
