import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PostCard } from "@/features/feed/post-card";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getPost, getPostComments } from "@/lib/feed/server";

export const metadata: Metadata = { title: "Shared post" };

export default async function PostPermalinkPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const account = await requireCurrentAccount();
  const { postId } = await params;
  if (!account.onboarded)
    redirect(`/onboarding?returnTo=${encodeURIComponent(`/post/${postId}`)}`);
  const post = await getPost(account.uid, postId);
  if (!post) notFound();
  const comments = await getPostComments(account.uid, postId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 lg:px-6">
      <h1 className="mb-4 font-serif text-3xl">Shared post</h1>
      <PostCard
        initialPost={post}
        initialComments={comments}
        viewer={{
          uid: account.uid,
          displayName: account.displayName ?? "Educator",
          photoURL: account.photoURL,
        }}
      />
    </div>
  );
}
