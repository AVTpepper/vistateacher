import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { getRouteAccount } from "@/lib/auth/route-account";
import { requireCurrentAccount, type SessionAccount } from "@/lib/auth/session";

export async function requirePlatformAdmin(): Promise<SessionAccount> {
  const account = await requireCurrentAccount();
  if (account.role !== "platform_admin") redirect("/dashboard");
  return account;
}

export async function getPlatformAdminRouteAccount(
  request: NextRequest,
): Promise<SessionAccount | null> {
  const account = await getRouteAccount(request);
  return account?.role === "platform_admin" ? account : null;
}
