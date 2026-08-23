"use client";

import { signInWithCustomToken } from "firebase/auth";

import { getFirebaseClient } from "@/lib/firebase/client";

let refreshPromise: Promise<ReturnType<typeof getFirebaseClient>> | null = null;

export function refreshFirebaseClientAuth() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch("/api/auth/client-token", {
      method: "POST",
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as {
      token?: string;
      error?: string;
    } | null;
    if (!response.ok || !result?.token)
      throw new Error(
        result?.error ?? "Your upload session could not be refreshed.",
      );

    const client = getFirebaseClient();
    await signInWithCustomToken(client.auth, result.token);
    return client;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function firebaseUploadErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code.includes("unauthenticated") || code.includes("unauthorized"))
    return "Your upload session expired. Please try the file again.";
  if (
    code.includes("retry-limit-exceeded") ||
    code.includes("network-request-failed")
  )
    return "The upload was interrupted. Check your connection and try again.";
  return fallback;
}
