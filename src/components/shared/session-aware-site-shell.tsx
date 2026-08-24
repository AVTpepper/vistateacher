import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/marketing-shell";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase/admin";

export async function SessionAwareSiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getCurrentAccount();
  if (!account) {
    return (
      <div className="bg-background min-h-screen">
        <MarketingHeader />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    );
  }

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
