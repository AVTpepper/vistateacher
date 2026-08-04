import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileView } from "@/features/profiles/profile-view";
import { requireCurrentAccount } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getProfileView } from "@/lib/profiles/server";

export const metadata: Metadata = { title: "Educator profile" };

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const [account, { uid }] = await Promise.all([
    requireCurrentAccount(),
    params,
  ]);
  const [data, resources] = await Promise.all([
    getProfileView(uid, account.uid),
    adminDb()
      .collection("resources")
      .where("authorId", "==", uid)
      .where("moderationStatus", "==", "approved")
      .limit(6)
      .get(),
  ]);
  if (!data) notFound();

  return (
    <div className="px-4 py-5 lg:px-6">
      <ProfileView
        data={data}
        resources={resources.docs.map((document) => ({
          id: document.id,
          title: String(document.data().title),
          type: String(document.data().type ?? "Resource"),
        }))}
      />
    </div>
  );
}
