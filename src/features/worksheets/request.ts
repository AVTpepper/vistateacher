export async function worksheetResult<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error ?? "The request could not be completed. Try again.",
    );
  return body as T;
}
