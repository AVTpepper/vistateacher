import type { Metadata } from "next";

import { PlatformShell } from "@/components/platform/platform-shell";
import { requireCurrentAccount } from "@/lib/auth/session";
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
  const [profile, subscription] = await Promise.all([
    adminDb().doc(`users/${account.uid}`).get(),
    adminDb().doc(`subscriptions/${account.uid}`).get(),
  ]);
  const profileData = profile.data();

  return (
    <PlatformShell
      account={{
        uid: account.uid,
        displayName: account.displayName ?? "Educator",
        photoURL: account.photoURL,
        role: account.role,
        subject: Array.isArray(profileData?.subjects)
          ? String(profileData.subjects[0] ?? "Educator")
          : "Educator",
      }}
      plan={subscription.data()?.plan === "plus" ? "plus" : "free"}
    >
      {children}
    </PlatformShell>
  );
}
