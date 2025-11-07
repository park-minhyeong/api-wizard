import { ValidateStatus, FetchRequestConfig, FetchResponse } from "./Fetch.js";

type DataType =
  | "application/json"
  | "application/x-www-form-urlencoded"
  | "application/xml"
  | "application/octet-stream"
  | "multipart/form-data"
  | "text/plain"
  | "text/html";


export interface TokenConfig {
  accessTokenKey?: string;
  refreshTokenKey?: string;
  refreshEndpoint?: string;
  getToken?: () => string | undefined;
  setToken?: (token: string) => void;
  removeToken?: () => void;
  getRefreshToken?: () => string | undefined;
  setRefreshToken?: (token: string) => void;
  removeRefreshToken?: () => void;
  onTokenExpired?: () => void;
  formatAuthHeader?: (token: string, refreshToken?: string) => Record<string, string>;
}

export interface Interceptor {
  tokenConfig?: TokenConfig;
  onRequest?: (config: any) => any;
  onResponse?: (response: FetchResponse) => FetchResponse;
  onError?: (error: any) => Promise<any>;
}

interface Option {
  version?: string;
  contentType?: DataType;
  accept?: DataType;
  charset?: string;
  interceptor?: Interceptor;
  requestConfig?: FetchRequestConfig;
  withCredentials?: boolean;
  validateStatus?: ValidateStatus;
}

export type { Option, DataType };
