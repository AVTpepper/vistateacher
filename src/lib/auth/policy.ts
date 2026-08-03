export const SESSION_COOKIE_NAME = "__session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
export const MAX_AUTH_AGE_SECONDS = 5 * 60;

export function isRecentAuthentication(
  authTimeSeconds: number | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return (
    typeof authTimeSeconds === "number" &&
    authTimeSeconds <= nowSeconds &&
    nowSeconds - authTimeSeconds <= MAX_AUTH_AGE_SECONDS
  );
}

export function isAllowedRequestOrigin(
  origin: string | null,
  appUrl: string,
): boolean {
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
