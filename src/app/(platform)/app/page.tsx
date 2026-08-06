import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FeedExperience } from "@/features/feed/feed-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getFeedPage } from "@/lib/feed/server";
import { adminDb } from "@/lib/firebase/admin";

export const metadata: Metadata = { title: "Home Feed" };

export default async function AppPage() {
  const account = await requireCurrentAccount();
  if (!account.onboarded) redirect("/onboarding");
  const [initialPage, profile] = await Promise.all([
    getFeedPage(account.uid, "all"),
    adminDb().doc(`users/${account.uid}`).get(),
  ]);
  const profileData = profile.data();

  return (
    <div className="px-4 py-5 lg:px-6">
      <FeedExperience
        initialPage={initialPage}
        account={{
          uid: account.uid,
          displayName: account.displayName ?? "Educator",
          photoURL: account.photoURL,
          gradeLevel: String(profileData?.gradeLevel ?? "Educator"),
          school: String(profileData?.school ?? ""),
        }}
      />
    </div>
  );
}
