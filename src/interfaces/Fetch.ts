export interface FetchResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  url: string;
  ok: boolean;
}

export type FetchParams = Record<string, string | number | undefined>;
/**
 * HTTP 상태 코드가 유효한지 검증하는 함수
 * @param status HTTP 상태 코드
 * @returns true면 정상 응답으로 처리, false면 에러로 throw
 * 
 * @example
 * // 500번대만 에러로 처리 (기본값)
 * validateStatus: (status) => status < 500
 * 
 * @example
 * // 400번대 이상 모두 에러로 처리
 * validateStatus: (status) => status >= 200 && status < 400
 * 
 * @example
 * // 401만 에러로 처리
 * validateStatus: (status) => status !== 401
 */
export type ValidateStatus = (status: number) => boolean;

export interface FetchRequestConfig extends RequestInit {
  params?: FetchParams;
  timeout?: number;
  baseURL?: string;
  validateStatus?: ValidateStatus;
}
