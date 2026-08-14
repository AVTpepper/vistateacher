import type { Metadata } from "next";

import { ProfileViewers } from "@/features/profiles/profile-viewers";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getProfileViewers } from "@/lib/profiles/server";

export const metadata: Metadata = { title: "Profile views" };

export default async function ProfileViewsPage() {
  const account = await requireCurrentAccount();
  const viewers = await getProfileViewers(account.uid);
  return <ProfileViewers viewers={viewers} />;
}
