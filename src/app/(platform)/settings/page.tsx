import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PrivacySettingsForm } from "@/features/profiles/privacy-settings-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/server";
import { getPrivateUser } from "@/lib/profiles/server";
import { PrivateRecoveryError } from "@/lib/profiles/private-user";

export const metadata: Metadata = { title: "Privacy and account" };

export default async function SettingsPage() {
  const account = await requireCurrentAccount();
  const [privateState, billing] = await Promise.all([
    getPrivateUser(account.uid, account.email).catch((error: unknown) => {
      if (!(error instanceof PrivateRecoveryError)) throw error;
      if (error.code === "profile-required") redirect("/onboarding");
      if (error.code === "inactive")
        redirect("/sign-in?error=account-unavailable");
      if (error.code === "invalid-identity") redirect("/sign-in");
      return error;
    }),
    getBillingState(account.uid).catch(() => null),
  ]);
  if (
    privateState instanceof PrivateRecoveryError ||
    privateState.state === "recovery-required"
  )
    return (
      <section className="surface-card space-y-4 p-6">
        <h1 className="font-serif text-2xl">Privacy and account</h1>
        <p role="status">
          {privateState instanceof PrivateRecoveryError
            ? privateState.message
            : "Some saved settings need review. Your contact details remain hidden."}{" "}
          Contact support before changing these settings.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link className="text-primary underline" href="/support">
            Contact support
          </Link>
          <Link className="text-primary underline" href="/settings/billing">
            Billing settings
          </Link>
        </div>
      </section>
    );
  const privateUser = privateState.user;
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
              canManageBilling: billing.canManageBilling,
              lifecycle: billing.lifecycle,
            }
          : null
      }
    />
  );
}
