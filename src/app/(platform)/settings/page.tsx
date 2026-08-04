import type { Metadata } from "next";

import { PrivacySettingsForm } from "@/features/profiles/privacy-settings-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getPrivateUser } from "@/lib/profiles/server";

export const metadata: Metadata = { title: "Privacy and account" };

export default async function SettingsPage() {
  const account = await requireCurrentAccount();
  const privateUser = await getPrivateUser(account.uid);
  return (
    <PrivacySettingsForm
      initial={{
        contactDetails: privateUser.contactDetails,
        privacySettings: privateUser.privacySettings,
        notificationSettings: privateUser.notificationSettings,
      }}
      deletionRequested={privateUser.accountDeletion.requestedAt !== null}
    />
  );
}
