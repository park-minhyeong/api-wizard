import { ParsedQs } from "qs";

type SchemaField =
  | { type: "number"; default?: number }
  | { type: "string"; default?: string };

type Schema = Record<string, SchemaField>;

type ParsedParamsFromSchema<S extends Schema> = {
  [K in keyof S]:
    S[K] extends { type: "number" } ? number :
    S[K] extends { type: "string" } ? string :
    never;
};

type Options<S extends Schema> = {
  defaults?: Partial<ParsedParamsFromSchema<S>>;
  numberDefault?: number;
  stringDefault?: string;
  /** 스키마 외 키 허용 여부 (기본 true) */
  allowUnknown?: boolean;
};

/** 입력: req.params / req.query / Next searchParams 전부 수용 */
type Input = ParsedQs | Record<string, string | string[] | undefined>;

/** 평탄화: string | undefined 만 남기기 */
function normalizeQueryLike(input: Input): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    if (typeof v === "string" || v === undefined) out[k] = v;
    else if (Array.isArray(v)) {
      const first = v.find((x): x is string => typeof x === "string");
      out[k] = first ?? undefined;
    } else {
      out[k] = undefined; // 중첩 객체는 버림
    }
  }
  return out;
}

/** 추가 키 타입: 유니온 배열의 요소 타입에서 키를 뽑아 스키마 키를 제외 */
type UnionOfArray<T extends readonly unknown[]> = T[number];
type FlatFromInput<I> =
  I extends Record<string, infer V> ? Record<string, V> : never;
type ExtraKeys<
  Inputs extends readonly unknown[],
  S extends Schema
> = Exclude<keyof FlatFromInput<UnionOfArray<Inputs>>, keyof S>;

/** 🔧 출력에서 undefined 제거: 스키마 외 키도 반드시 string */
type ParsedWithExtras<
  Inputs extends readonly unknown[],
  S extends Schema
> = ParsedParamsFromSchema<S> & {
  [K in ExtraKeys<Inputs, S>]: string;
};

export function createParsedParams<S extends Schema>(
  schema: S,
  opts: Options<S> = {}
) {
  const numberDefault = opts.numberDefault ?? 0;
  const stringDefault = opts.stringDefault ?? "";
  const allowUnknown = opts.allowUnknown ?? true;
  async function parse<
    Inputs extends readonly Input[]
  >(
    inputs: Inputs,
  ): Promise<ParsedWithExtras<Inputs, S>> {
    const flats = inputs.map(normalizeQueryLike);
    const out: any = {} as ParsedWithExtras<Inputs, S>;
    for (const key in schema) {
      const field = schema[key];
      const raws = flats.map(f => f[key]).filter(x => x !== undefined);
      const val = raws[0];
      if (field.type === "number") {
        const n = val == null ? NaN : parseInt(val, 10);
        const parsed = Number.isNaN(n)
          ? (field.default ?? numberDefault)
          : n;
        out[key] = parsed;
      } else {
        const parsed = val ?? field.default ?? stringDefault;
        out[key] = parsed;
      }
    }
    if (allowUnknown) {
      const allKeys = new Set<string>();
      for (const f of flats) for (const k of Object.keys(f)) allKeys.add(k);
      for (const k of allKeys) {
        if (k in schema) continue; // 이미 처리됨
        const raws = flats.map(f => f[k]).filter(x => x !== undefined);
        const val = raws[0];
        out[k] = (val ?? stringDefault) as string; // ← 항상 string 보장
      }
    }
    return out;
  }
  return Object.assign(parse, { normalize: normalizeQueryLike });
} 
