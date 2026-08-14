const APP_ORIGIN = "https://vistateacher.invalid";

export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048)
    return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function hrefWithReturnTo(path: string, returnTo: string | null) {
  const safe = safeReturnTo(returnTo);
  if (!safe) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}returnTo=${encodeURIComponent(safe)}`;
}
