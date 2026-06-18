export type CorsOriginCallback = (
  error: Error | null,
  allow?: boolean,
) => void;

export function createCorsOriginHandler(allowedOrigins: string[]) {
  const allowed = new Set(
    allowedOrigins.map((value) => value.trim()).filter(Boolean),
  );

  return (origin: string | undefined, callback: CorsOriginCallback) => {
    callback(null, !origin || allowed.has(origin));
  };
}
