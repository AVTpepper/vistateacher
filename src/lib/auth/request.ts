import "server-only";

import type { NextRequest } from "next/server";

import { isAllowedRequestOrigin } from "@/lib/auth/policy";

export function hasTrustedOrigin(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (!origin || !host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  return Boolean(
    process.env.NEXT_PUBLIC_APP_URL &&
    isAllowedRequestOrigin(
      request.headers.get("origin"),
      process.env.NEXT_PUBLIC_APP_URL,
    ),
  );
}
