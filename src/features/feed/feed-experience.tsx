"use client";

import { FileText, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FeedComposer } from "@/features/feed/feed-composer";
import { PostCard } from "@/features/feed/post-card";
import type { FeedPage, FeedPost } from "@/lib/feed/server";
import { cn } from "@/lib/utils";
import type { CreatePostInput, FeedView } from "@/schemas/feed";

interface FeedExperienceProps {
  initialPage: FeedPage;
  account: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    gradeLevel: string;
    school: string;
  };
}

const tabs: { value: FeedView; label: string }[] = [
  { value: "all", label: "Community feed" },
  { value: "following", label: "Connections feed" },
  { value: "saved", label: "Saved" },
];

async function loadFeed(view: FeedView, cursor?: string | null) {
  const params = new URLSearchParams({ view });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/feed?${params}`);
  const result = (await response.json().catch(() => null)) as FeedPage | null;
  if (!response.ok || !result) throw new Error("feed-load-failed");
  return result;
}

export function FeedExperience({ initialPage, account }: FeedExperienceProps) {
  const [view, setView] = useState<FeedView>("all");
  const [posts, setPosts] = useState(initialPage.posts);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);

  async function selectView(nextView: FeedView) {
    if (nextView === view || loading) return;
    const previousView = view;
    setView(nextView);
    setLoading(true);
    try {
      const page = await loadFeed(nextView);
      setPosts(page.posts);
      setNextCursor(page.nextCursor);
    } catch {
      setView(previousView);
      toast.error("We couldn't load that feed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await loadFeed(view, nextCursor);
      setPosts((current) => [...current, ...page.posts]);
      setNextCursor(page.nextCursor);
    } catch {
      toast.error("We couldn't load more posts.");
    } finally {
      setLoading(false);
    }
  }

  async function create(input: CreatePostInput): Promise<boolean> {
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimistic: FeedPost = {
      id: temporaryId,
      author: {
        uid: account.uid,
        displayName: account.displayName,
        photoURL: account.photoURL,
        gradeLevel: account.gradeLevel,
        school: account.school,
      },
      type: input.type,
      content: input.content,
      imageURLs: input.imageURLs,
      tags: input.tags,
      mentions: [],
      resourceId: input.resourceId,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      bookmarkCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      liked: false,
      bookmarked: false,
      ownedByViewer: true,
    };
    const previousPosts = posts;
    const previousView = view;
    setView("all");
    setPosts((current) => [optimistic, ...(view === "all" ? current : [])]);
    const response = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = (await response.json().catch(() => null)) as {
      postId?: string;
      error?: string;
    } | null;
    if (!response.ok || !result?.postId) {
      setView(previousView);
      setPosts(previousPosts);
      toast.error(result?.error ?? "We couldn't publish that post.");
      return false;
    }
    try {
      const page = await loadFeed("all");
      setPosts(page.posts);
      setNextCursor(page.nextCursor);
    } catch {
      setPosts((current) =>
        current.map((post) =>
          post.id === temporaryId ? { ...post, id: result.postId! } : post,
        ),
      );
    }
    toast.success("Post published.");
    return true;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="surface-card flex gap-1 p-1">
        {tabs.map((tab) => (
          <button
            type="button"
            aria-pressed={view === tab.value}
            key={tab.value}
            onClick={() => void selectView(tab.value)}
            className={cn(
              "min-h-11 flex-1 rounded-lg text-sm font-semibold transition-colors",
              view === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <FeedComposer account={account} onCreate={create} />
      {loading && posts.length === 0 ? (
        <div className="text-muted-foreground grid place-items-center py-16">
          <LoaderCircle
            aria-label="Loading feed"
            className="size-6 animate-spin"
          />
        </div>
      ) : posts.length === 0 ? (
        <section className="surface-card px-6 py-14 text-center">
          <FileText
            aria-hidden="true"
            className="text-muted-foreground/40 mx-auto size-8"
          />
          <h2 className="mt-3 font-serif text-xl">No posts yet</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {view === "saved"
              ? "Save posts to read them later."
              : view === "following"
                ? "Posts from your connections will appear here."
                : "Start a useful conversation with the community."}
          </p>
        </section>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            initialPost={post}
            viewer={account}
            onDelete={(postId, restore) =>
              setPosts((current) =>
                restore
                  ? current.some((item) => item.id === postId)
                    ? current
                    : [restore, ...current]
                  : current.filter((item) => item.id !== postId),
              )
            }
            onBookmarkRemoved={(postId) => {
              if (view === "saved")
                setPosts((current) =>
                  current.filter((item) => item.id !== postId),
                );
            }}
          />
        ))
      )}
      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className="bg-card text-primary hover:bg-secondary h-11 w-full rounded-xl border text-sm font-bold disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load more posts"}
        </button>
      )}
    </div>
  );
}
