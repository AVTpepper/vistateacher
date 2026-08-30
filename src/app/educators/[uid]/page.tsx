import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/marketing-shell";
import { ProfileView } from "@/features/profiles/profile-view";
import { ProfileTabProvider } from "@/features/profiles/profile-tab-context";
import { getCurrentAccount } from "@/lib/auth/session";
import { getProfilePosts } from "@/lib/feed/server";
import { adminDb } from "@/lib/firebase/admin";
import { getProfileView } from "@/lib/profiles/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uid: string }>;
}): Promise<Metadata> {
  const { uid } = await params;
  const snapshot = await adminDb().doc(`users/${uid}`).get();
  const data = snapshot.data();
  const displayName =
    typeof data?.displayName === "string" ? data.displayName : "Educator";
  return { title: `${displayName} | VistaTeacher` };
}

export default async function PublicEducatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ uid }, account, queryParams] = await Promise.all([
    params,
    getCurrentAccount(),
    searchParams,
  ]);
  const rawTab = Array.isArray(queryParams.tab)
    ? queryParams.tab[0]
    : queryParams.tab;
  const activeTab =
    rawTab === "resources" || rawTab === "posts" ? rawTab : "about";
  const resourceQuery = adminDb()
    .collection("resources")
    .where("authorId", "==", uid)
    .where("moderationStatus", "==", "approved");
  const [data, profilePosts, resourceSnapshot] = await Promise.all([
    getProfileView(uid, account?.uid ?? null),
    getProfilePosts(account?.uid ?? "__anonymous__", uid),
    resourceQuery.get(),
  ]);
  if (!data) notFound();
  const resources = resourceSnapshot.docs
    .filter((document) => document.data().status === "active")
    .sort(
      (left, right) =>
        Number(right.data().createdAt?.toMillis?.() ?? 0) -
        Number(left.data().createdAt?.toMillis?.() ?? 0),
    );

  return (
    <div className="bg-background min-h-screen">
      <MarketingHeader />
      <main className="px-4 py-8 lg:px-6">
        <ProfileTabProvider initialTab={activeTab} key={uid}>
          <ProfileView
            data={data}
            postCount={profilePosts.total}
            posts={profilePosts.posts}
            resourceCount={resources.length}
            resources={resources.slice(0, 20).map((document) => ({
              id: document.id,
              title: String(document.data().title),
              type: String(document.data().type ?? "Resource"),
            }))}
            viewer={{
              uid: account?.uid ?? "__anonymous__",
              displayName: account?.displayName ?? "Guest",
              photoURL: account?.photoURL ?? null,
            }}
          />
        </ProfileTabProvider>
      </main>
      <MarketingFooter />
    </div>
  );
}
