export const bigintEncoder = (_key: string, value: unknown) =>
  typeof value === "bigint"
    ? value > Number.MAX_SAFE_INTEGER
      ? value.toString()
      : Number(value)
    : value;
