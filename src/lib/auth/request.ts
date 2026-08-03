import "server-only";

import type { NextRequest } from "next/server";

import { isAllowedRequestOrigin } from "@/lib/auth/policy";

export function hasTrustedOrigin(request: NextRequest): boolean {
  const appUrl =
    process.env.NODE_ENV === "production"
      ? process.env.NEXT_PUBLIC_APP_URL
      : request.nextUrl.origin;

  return Boolean(
    appUrl && isAllowedRequestOrigin(request.headers.get("origin"), appUrl),
  );
}
