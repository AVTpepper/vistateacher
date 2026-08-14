"use client";

import { useState } from "react";

import { PostCard } from "@/features/feed/post-card";
import type { FeedPost } from "@/lib/feed/server";

export function ProfilePostList({
  initialPosts,
  viewer,
}: {
  initialPosts: FeedPost[];
  viewer: { uid: string; displayName: string; photoURL: string | null };
}) {
  const [posts, setPosts] = useState(initialPosts);

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          initialPost={post}
          viewer={viewer}
          onDelete={(postId, restore) =>
            setPosts((current) =>
              restore
                ? current.some((item) => item.id === postId)
                  ? current
                  : [restore, ...current]
                : current.filter((item) => item.id !== postId),
            )
          }
        />
      ))}
    </div>
  );
}
