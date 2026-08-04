import "server-only";

import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";
import { verifySessionCookie } from "@/lib/auth/session";

export async function getRouteAccount(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const account = cookie ? await verifySessionCookie(cookie) : null;
  if (!account || account.status !== "active") return null;
  return account;
}
