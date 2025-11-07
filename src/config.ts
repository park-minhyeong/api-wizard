import { FetchRequestConfig } from "./interfaces/index.js";
import { Option } from "./interfaces/index.js";

interface CreateFetchDefaultsProps {
  baseUrl: string;
  option?: Option;
}

interface FetchDefaults {
  baseURL: string;
  headers: HeadersInit;
  credentials: RequestCredentials;
}

const createFetchDefaults = ({
  baseUrl = "/api",
  option,
}: Partial<CreateFetchDefaultsProps>): FetchDefaults => {
  const {
    version,
    contentType,
    charset,
    accept,
    withCredentials = true, // 기본값 true (axios와 동일)
  } = option ?? {};
  
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = [contentType, charset && `; charset=${charset}`].join("");
  if (accept) headers["Accept"] = accept;
  return {
    baseURL: typeof version !== "undefined" ? [baseUrl, version].join("/") : baseUrl,
    headers: headers as HeadersInit,
    credentials: withCredentials ? "include" : "omit" as RequestCredentials,
  };
};

const fetchRequestConfig: FetchRequestConfig = {
  credentials: "include", // 기본값
};

export { createFetchDefaults, fetchRequestConfig };
