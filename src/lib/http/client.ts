/** A failed request must reject so callers can keep drafts and recover pending state. */
export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Check your connection and try again.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error ?? "The request failed. Please try again.");
  }
  if (result === null)
    throw new Error("The response could not be read. Please try again.");
  return result as T;
}
