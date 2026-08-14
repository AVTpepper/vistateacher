import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";
import { hrefWithReturnTo, safeReturnTo } from "@/lib/auth/return-to";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { UserRole, UserStatus } from "@/types/models";

export interface SessionAccount {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus | null;
  onboarded: boolean;
}

export async function verifySessionCookie(
  value: string,
): Promise<SessionAccount | null> {
  try {
    const decoded = await adminAuth().verifySessionCookie(value, true);
    if (!decoded.email || !decoded.email_verified) return null;

    const profile = await adminDb().doc(`users/${decoded.uid}`).get();
    const profileData = profile.data();

    return {
      uid: decoded.uid,
      email: decoded.email,
      displayName:
        (profileData?.displayName as string | undefined) ??
        decoded.name ??
        null,
      photoURL:
        (profileData?.photoURL as string | null | undefined) ??
        decoded.picture ??
        null,
      emailVerified: true,
      role:
        (profileData?.role as UserRole | undefined) ??
        (decoded.role as UserRole | undefined) ??
        "educator",
      status: (profileData?.status as UserStatus | undefined) ?? null,
      onboarded: profile.exists,
    };
  } catch {
    return null;
  }
}

export const getCurrentAccount = cache(async () => {
  const value = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return value ? verifySessionCookie(value) : null;
});

export async function requireCurrentAccount(): Promise<SessionAccount> {
  const account = await getCurrentAccount();
  if (!account) {
    const returnTo = safeReturnTo(
      (await headers()).get("x-vistateacher-return-to"),
    );
    redirect(hrefWithReturnTo("/sign-in", returnTo));
  }
  if (account.status === "suspended" || account.status === "deleted") {
    redirect("/sign-in?error=account-unavailable");
  }
  return account;
}
