import type { Metadata } from "next";

import { PlatformShell } from "@/components/platform/platform-shell";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase/admin";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await requireCurrentAccount();
  const [profile, billing] = await Promise.all([
    adminDb().doc(`users/${account.uid}`).get(),
    getBillingState(account.uid).catch(() => null),
  ]);
  const profileData = profile.data();

  return (
    <PlatformShell
      account={{
        uid: account.uid,
        displayName: account.displayName ?? "Educator",
        photoURL: account.photoURL,
        role: account.role,
        onboarded: account.onboarded,
        subject: Array.isArray(profileData?.subjects)
          ? String(profileData.subjects[0] ?? "Educator")
          : "Educator",
      }}
      plan={billing?.effectivePlan ?? "free"}
    >
      {children}
    </PlatformShell>
  );
}
