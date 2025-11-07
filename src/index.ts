import instance from "./instance.js";
import { Http, Option } from "./interfaces/index.js";

type Handler<T> = {
  [p in keyof T]: (option?: Option) => Http;
};

function handler<T extends Record<string, string>>(
  obj: T,
  globalOption?: Option
): Handler<T> {
  return Object.keys(obj).reduce<Handler<T>>((acc, cur) => {
    acc[cur as keyof T] = (option?: Option) =>
      instance(obj[cur], { ...globalOption, ...option });
    return acc;
  }, {} as Handler<T>);
}

export { handler };
export * from "./utils/index.js";

// 타입 명시적 re-export (타입 정의 파일에서만 존재)
export type { FetchResponse, FetchRequestConfig, FetchParams, ValidateStatus } from "./interfaces/Fetch.js";
export type { Http, FetchClient } from "./interfaces/Http.js";
export type { Interceptor, TokenConfig, Option, DataType } from "./interfaces/Property.js";