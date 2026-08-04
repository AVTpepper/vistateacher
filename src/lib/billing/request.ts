import "server-only";

import type { NextRequest } from "next/server";

export function getBillingOrigin(request: NextRequest): string {
  if (process.env.NODE_ENV !== "production") return request.nextUrl.origin;

  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  return new URL(configured).origin;
}
