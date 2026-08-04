import type { Metadata } from "next";

import { NotificationsExperience } from "@/features/notifications/notifications-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getNotifications } from "@/lib/messages/server";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const account = await requireCurrentAccount();
  return (
    <NotificationsExperience
      initialPage={await getNotifications(account.uid)}
    />
  );
}
