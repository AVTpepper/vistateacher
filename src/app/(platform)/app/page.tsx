import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FeedExperience } from "@/features/feed/feed-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getFeedPage } from "@/lib/feed/server";
import { feedViewSchema } from "@/schemas/feed";
import { adminDb } from "@/lib/firebase/admin";

export const metadata: Metadata = { title: "Home Feed" };

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsedView = feedViewSchema.safeParse(
    Array.isArray(params.view) ? params.view[0] : params.view,
  );
  const view = parsedView.success ? parsedView.data : "all";
  const account = await requireCurrentAccount();
  if (!account.onboarded) redirect("/onboarding");
  const [initialPage, profile] = await Promise.all([
    getFeedPage(account.uid, view),
    adminDb().doc(`users/${account.uid}`).get(),
  ]);
  const profileData = profile.data();

  return (
    <div className="page-container">
      <FeedExperience
        initialPage={initialPage}
        initialView={view}
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
