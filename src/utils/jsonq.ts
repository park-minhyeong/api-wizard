
const toBase64Url = (buf: Uint8Array): string =>
  (typeof Buffer !== "undefined"
    ? Buffer.from(buf).toString("base64")
    : btoa(String.fromCharCode(...buf))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Base64URL → Uint8Array */
const fromBase64Url = (b64u: string): Uint8Array => {
  const b64 =
    b64u.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((b64u.length + 3) % 4);
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  } else {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
};

async function encodeQuery(obj: undefined): Promise<undefined>;
async function encodeQuery(obj: unknown): Promise<string>;
async function encodeQuery(obj: unknown | undefined): Promise<string | undefined> {
  try {
    if(obj===undefined) return undefined;
    const json = JSON.stringify(obj);
    const input = new TextEncoder().encode(json);
    if (typeof CompressionStream !== "undefined") {
      const cs = new CompressionStream("gzip");
      const stream = new Blob([input]).stream().pipeThrough(cs);
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
      return toBase64Url(compressed);
    }
    const { gzipSync } = await import("zlib");
    const compressed: Buffer = gzipSync(new Uint8Array(input));
    return toBase64Url(new Uint8Array(compressed));
  } catch (error) {
    throw new Error(`Failed to encode query: ${error instanceof Error ? error.message : String(error)}`);
  }
} 

async function decodeQuery<T = unknown>(q: undefined): Promise<undefined>;
async function decodeQuery<T = unknown>(q: string): Promise<T>;
async function decodeQuery<T = unknown>(q?: string | undefined): Promise<T | undefined> {
  try {
    if(q===undefined) return undefined;
    const compressed = fromBase64Url(q);
    if (typeof DecompressionStream !== "undefined") { 
      const ds = new DecompressionStream("gzip");
      const newArrayBuffer = new ArrayBuffer(compressed.length);
      const newUint8Array = new Uint8Array(newArrayBuffer);
      newUint8Array.set(compressed);
      const stream = new Blob([newArrayBuffer]).stream().pipeThrough(ds);
      const json = await new Response(stream).text();
      return JSON.parse(json) as T;
    }
    const { gunzipSync } = await import("zlib");
    const json = gunzipSync(new Uint8Array(compressed)).toString("utf-8");
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`Failed to decode query: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export { decodeQuery, encodeQuery };