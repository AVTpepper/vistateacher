import { requestJson } from "@/lib/http/client";

/** Notification actions are idempotent and safe to retry after a timeout. */
export function requestNotificationJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  return requestJson<T>(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
}
