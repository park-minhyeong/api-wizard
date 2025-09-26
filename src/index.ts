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
export * from "./interfaces/index.js";
export * from "./utils/index.js";
