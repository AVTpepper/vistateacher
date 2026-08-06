import type { Metadata } from "next";

import { PrivacySettingsForm } from "@/features/profiles/privacy-settings-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";
import { getPrivateUser } from "@/lib/profiles/server";

export const metadata: Metadata = { title: "Privacy and account" };

export default async function SettingsPage() {
  const account = await requireCurrentAccount();
  const [privateUser, billing] = await Promise.all([
    getPrivateUser(account.uid, account.email),
    getBillingState(account.uid).catch(() => null),
  ]);
  return (
    <PrivacySettingsForm
      initial={{
        contactDetails: privateUser.contactDetails,
        privacySettings: privateUser.privacySettings,
        notificationSettings: privateUser.notificationSettings,
      }}
      deletionRequested={privateUser.accountDeletion.requestedAt !== null}
      billing={
        billing
          ? {
              effectivePlan: billing.effectivePlan,
              currentPeriodEnd: billing.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
            }
          : null
      }
    />
  );
}
