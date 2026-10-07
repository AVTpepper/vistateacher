"use client";

import { FileText, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJson } from "@/lib/http/client";
import { toast } from "sonner";

import { FeedComposer } from "@/features/feed/feed-composer";
import { PostCard } from "@/features/feed/post-card";
import type { FeedPage, FeedPost } from "@/lib/feed/server";
import { cn } from "@/lib/utils";
import type { CreatePostInput, FeedView } from "@/schemas/feed";

interface FeedExperienceProps {
  initialPage: FeedPage;
  initialView?: FeedView;
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

export function FeedExperience({
  initialPage,
  initialView = "all",
  account,
}: FeedExperienceProps) {
  const router = useRouter();
  const view = initialView;
  const [previousPage, setPreviousPage] = useState(initialPage);
  const [posts, setPosts] = useState(initialPage.posts);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);

  if (previousPage !== initialPage) {
    setPreviousPage(initialPage);
    setPosts(initialPage.posts);
    setNextCursor(initialPage.nextCursor);
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
      fileAttachments: input.fileAttachments,
      linkURLs: input.linkURLs,
      tags: input.tags,
      mentions: [],
      resourceId: input.resourceId,
      activity: null,
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
    if (view === "all") setPosts((current) => [optimistic, ...current]);
    let postId: string;
    try {
      const result = await requestJson<{ postId: string }>("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!result.postId)
        throw new Error(
          "Post could not be confirmed. Refresh before retrying.",
        );
      postId = result.postId;
    } catch (error) {
      setPosts((current) => current.filter((post) => post.id !== temporaryId));
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't publish that post.",
      );
      return false;
    }
    if (view !== "all") router.push("/app?view=all");
    else {
      try {
        const page = await loadFeed("all");
        setPosts(page.posts);
        setNextCursor(page.nextCursor);
      } catch {
        setPosts((current) =>
          current.map((post) =>
            post.id === temporaryId ? { ...post, id: postId } : post,
          ),
        );
      }
    }
    toast.success("Post published.");
    return true;
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-4">
      <div className="surface-card flex gap-1 p-1">
        {tabs.map((tab) => (
          <Link
            href={`/app?view=${tab.value}`}
            scroll={false}
            aria-current={view === tab.value ? "page" : undefined}
            key={tab.value}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-center text-sm font-semibold transition-colors",
              view === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
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
