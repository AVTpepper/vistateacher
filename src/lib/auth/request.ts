import "server-only";

import type { NextRequest } from "next/server";

import { isAllowedRequestOrigin } from "@/lib/auth/policy";

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const [first] = value.split(",", 1);
  const trimmed = first?.trim();
  return trimmed ? trimmed : null;
}

function originHost(origin: string | null): string | null {
  if (!origin) return null;

  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const requestOriginHost = originHost(origin);
  if (!requestOriginHost) return false;

  const forwardedHost = firstHeaderValue(
    request.headers.get("x-forwarded-host"),
  );
  if (forwardedHost && requestOriginHost === forwardedHost) {
    return true;
  }

  const host = firstHeaderValue(request.headers.get("host"));
  if (host && requestOriginHost === host) {
    return true;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return false;

  return isAllowedRequestOrigin(origin, appUrl);
}
