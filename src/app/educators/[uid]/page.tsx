import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/marketing-shell";
import { ProfileView } from "@/features/profiles/profile-view";
import { getCurrentAccount } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getProfileView } from "@/lib/profiles/server";

export const metadata: Metadata = { title: "Educator profile" };

export default async function PublicEducatorPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const [{ uid }, account] = await Promise.all([params, getCurrentAccount()]);
  const [data, resources] = await Promise.all([
    getProfileView(uid, account?.uid ?? null),
    adminDb()
      .collection("resources")
      .where("authorId", "==", uid)
      .where("moderationStatus", "==", "approved")
      .limit(6)
      .get(),
  ]);
  if (!data) notFound();

  return (
    <div className="bg-background min-h-screen">
      <MarketingHeader />
      <main className="px-4 py-8 lg:px-6">
        <ProfileView
          data={data}
          resources={resources.docs.map((document) => ({
            id: document.id,
            title: String(document.data().title),
            type: String(document.data().type ?? "Resource"),
          }))}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
