/** Keep a mounted private workspace bound to the account that rendered it. */
export function accountFetch(
  uid: string,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Vista-Expected-Uid", uid);
  return fetch(input, { ...init, headers });
}
