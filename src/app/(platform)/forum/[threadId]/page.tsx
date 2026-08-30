import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ForumThreadExperience } from "@/features/forum/forum-thread-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getForumThread } from "@/lib/forum/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ threadId: string }>;
}): Promise<Metadata> {
  const { threadId } = await params;
  const snapshot = await adminDb().doc(`forumThreads/${threadId}`).get();
  const data = snapshot.data();
  const title =
    typeof data?.title === "string" ? data.title : "Forum discussion";
  return { title };
}

export default async function ForumThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const [account, { threadId }] = await Promise.all([
    requireCurrentAccount(),
    params,
  ]);
  const data = await getForumThread(threadId, account.uid, account.role);
  if (!data) notFound();
  return (
    <div className="px-4 py-5 lg:px-6">
      <ForumThreadExperience
        key={data.thread.viewCount}
        initialData={data}
        viewer={{
          uid: account.uid,
          displayName: account.displayName ?? "Educator",
          photoURL: account.photoURL,
          role: account.role,
        }}
      />
    </div>
  );
}
