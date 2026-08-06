"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { FeedComment, FeedPost } from "@/lib/feed/server";
import { cn } from "@/lib/utils";

interface PostCardProps {
  initialPost: FeedPost;
  viewer: { displayName: string; photoURL: string | null };
  onDelete: (postId: string, restore?: FeedPost) => void;
  onBookmarkRemoved: (postId: string) => void;
}

const typeStyle = {
  post: "bg-primary/10 text-primary",
  resource: "bg-success/10 text-success",
  question: "bg-accent/10 text-accent",
};

const typeLabel = {
  post: "Post",
  resource: "Resource Share",
  question: "Question",
};

async function mutation(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function PostCard({
  initialPost,
  viewer,
  onDelete,
  onBookmarkRemoved,
}: PostCardProps) {
  const [post, setPost] = useState(initialPost);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [postDraft, setPostDraft] = useState(initialPost.content);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  async function toggleLike() {
    const previous = post;
    const liked = !post.liked;
    setPost((current) => ({
      ...current,
      liked,
      likeCount: Math.max(0, current.likeCount + (liked ? 1 : -1)),
    }));
    const response = await mutation(
      `/api/feed/${post.id}/like`,
      liked ? "PUT" : "DELETE",
    );
    if (!response.ok) {
      setPost(previous);
      toast.error("We couldn't update that like.");
    }
  }

  async function toggleBookmark() {
    const previous = post;
    const bookmarked = !post.bookmarked;
    setPost((current) => ({ ...current, bookmarked }));
    const response = await mutation(
      `/api/feed/${post.id}/bookmark`,
      bookmarked ? "PUT" : "DELETE",
    );
    if (!response.ok) {
      setPost(previous);
      toast.error("We couldn't update that saved post.");
    } else if (!bookmarked) onBookmarkRemoved(post.id);
  }

  async function openComments() {
    setCommentsOpen((open) => !open);
    if (comments !== null) return;
    const response = await fetch(`/api/feed/${post.id}/comments`);
    const result = (await response.json().catch(() => null)) as {
      comments?: FeedComment[];
    } | null;
    if (response.ok) setComments(result?.comments ?? []);
    else {
      setComments([]);
      toast.error("We couldn't load the comments.");
    }
  }

  async function addComment() {
    const content = comment.trim();
    if (!content || commenting) return;
    setCommenting(true);
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimistic: FeedComment = {
      id: temporaryId,
      author: {
        uid: "viewer",
        displayName: viewer.displayName,
        photoURL: viewer.photoURL,
        gradeLevel: "",
        school: "",
      },
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      ownedByViewer: true,
    };
    setComments((current) => [...(current ?? []), optimistic]);
    setPost((current) => ({
      ...current,
      commentCount: current.commentCount + 1,
    }));
    setComment("");
    const response = await mutation(`/api/feed/${post.id}/comments`, "POST", {
      content,
    });
    const result = (await response.json().catch(() => null)) as {
      commentId?: string;
    } | null;
    if (response.ok && result?.commentId) {
      setComments(
        (current) =>
          current?.map((item) =>
            item.id === temporaryId ? { ...item, id: result.commentId! } : item,
          ) ?? [],
      );
    } else {
      setComments(
        (current) => current?.filter((item) => item.id !== temporaryId) ?? [],
      );
      setPost((current) => ({
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
      }));
      setComment(content);
      toast.error("We couldn't add that comment.");
    }
    setCommenting(false);
  }

  async function removePost() {
    setMenuOpen(false);
    onDelete(post.id);
    const response = await mutation(`/api/feed/${post.id}`, "DELETE");
    if (!response.ok) {
      onDelete(post.id, post);
      toast.error("We couldn't delete that post.");
      return;
    }
    toast.success("Post deleted.");
  }

  async function savePostEdit() {
    const content = postDraft.trim();
    if (!content) return;
    const response = await mutation(`/api/feed/${post.id}`, "PATCH", {
      type: post.type,
      content,
      imageURLs: post.imageURLs,
      tags: post.tags,
      resourceId: post.resourceId,
    });
    if (!response.ok) {
      toast.error("We couldn't update that post.");
      return;
    }
    setPost((current) => ({
      ...current,
      content,
      updatedAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
    }));
    setEditingPost(false);
    toast.success("Post updated.");
  }

  async function saveCommentEdit(commentId: string) {
    const content = commentDraft.trim();
    if (!content) return;
    const response = await mutation(
      `/api/feed/${post.id}/comments/${commentId}`,
      "PATCH",
      { content },
    );
    if (!response.ok) {
      toast.error("We couldn't update that comment.");
      return;
    }
    setComments(
      (current) =>
        current?.map((item) =>
          item.id === commentId
            ? {
                ...item,
                content,
                updatedAt: new Date().toISOString(),
                editedAt: new Date().toISOString(),
              }
            : item,
        ) ?? [],
    );
    setEditingCommentId(null);
    setCommentDraft("");
    toast.success("Comment updated.");
  }

  async function removeComment(commentId: string) {
    const response = await mutation(
      `/api/feed/${post.id}/comments/${commentId}`,
      "DELETE",
    );
    if (!response.ok) {
      toast.error("We couldn't delete that comment.");
      return;
    }
    setComments(
      (current) => current?.filter((item) => item.id !== commentId) ?? [],
    );
    setPost((current) => ({
      ...current,
      commentCount: Math.max(0, current.commentCount - 1),
    }));
  }

  async function report() {
    setMenuOpen(false);
    const response = await mutation(`/api/feed/${post.id}/report`, "POST", {
      reason: "other",
      details: "Reported from the feed.",
    });
    if (response.ok) toast.success("Report submitted for review.");
    else toast.error("This post could not be reported.");
  }

  async function share() {
    const url = `${window.location.origin}/app?post=${post.id}`;
    if (navigator.share)
      await navigator.share({ title: "VistaTeacher post", url });
    else {
      await navigator.clipboard.writeText(url);
      toast.success("Post link copied.");
    }
  }

  return (
    <article className="bg-card border-primary/15 hover:border-primary/30 overflow-hidden rounded-xl border transition-[border-color,box-shadow] hover:shadow-lg">
      <header className="flex items-start gap-3 p-4 pb-3">
        <UserAvatar
          name={post.author.displayName}
          photoURL={post.author.photoURL}
          className="size-10 shrink-0 rounded-full text-xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{post.author.displayName}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                typeStyle[post.type],
              )}
            >
              {typeLabel[post.type]}
            </span>
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {[post.author.gradeLevel, post.author.school]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
            {post.editedAt
              ? ` · edited ${formatDistanceToNow(new Date(post.editedAt), { addSuffix: true })}`
              : ""}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="Post options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="text-muted-foreground hover:bg-muted grid size-11 place-items-center rounded-lg"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </button>
          {menuOpen && (
            <div className="bg-popover absolute top-12 right-0 z-20 w-40 overflow-hidden rounded-lg border py-1 shadow-lg">
              <button
                type="button"
                onClick={() => void toggleBookmark()}
                className="hover:bg-muted min-h-11 w-full px-3 py-2 text-left text-sm"
              >
                {post.bookmarked ? "Remove saved post" : "Save post"}
              </button>
              {!post.ownedByViewer && (
                <button
                  type="button"
                  onClick={() => void report()}
                  className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                >
                  Report
                </button>
              )}
              {post.ownedByViewer && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPostDraft(post.content);
                    setEditingPost(true);
                  }}
                  className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Pencil aria-hidden="true" className="size-3.5" /> Edit
                </button>
              )}
              {post.ownedByViewer && (
                <button
                  type="button"
                  onClick={() => void removePost()}
                  className="text-destructive hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="px-4 pb-3">
        {editingPost ? (
          <div className="space-y-2">
            <textarea
              value={postDraft}
              onChange={(event) => setPostDraft(event.target.value)}
              maxLength={5000}
              rows={4}
              className="bg-muted w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPost(false)}
                className="h-8 rounded-lg border px-3 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePostEdit()}
                className="bg-primary text-primary-foreground h-8 rounded-lg px-3 text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 whitespace-pre-line">
            {post.content}
          </p>
        )}
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="text-primary text-xs">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {post.imageURLs[0] && (
        <div className="bg-muted relative mx-4 mb-3 aspect-video overflow-hidden rounded-lg">
          <Image
            src={post.imageURLs[0]}
            alt="Shared post image"
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      )}
      <div className="text-muted-foreground mx-4 flex items-center justify-between border-b pb-2 text-xs">
        <button type="button" onClick={() => void toggleLike()}>
          {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
        </button>
        <button type="button" onClick={() => void openComments()}>
          {post.commentCount} comments · {post.shareCount} shares
        </button>
      </div>
      <div className="flex px-2 py-1">
        <button
          type="button"
          aria-label={post.liked ? "Unlike post" : "Like post"}
          onClick={() => void toggleLike()}
          className={cn(
            "hover:bg-muted flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold",
            post.liked ? "text-destructive" : "text-muted-foreground",
          )}
        >
          <Heart
            aria-hidden="true"
            className={cn("size-4", post.liked && "fill-current")}
          />
          <span className="hidden sm:inline">
            {post.liked ? "Liked" : "Like"}
          </span>
        </button>
        <button
          type="button"
          aria-label="Comment on post"
          onClick={() => void openComments()}
          className="text-muted-foreground hover:bg-muted flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Comment</span>
        </button>
        <button
          type="button"
          aria-label="Share post"
          onClick={() => void share()}
          className="text-muted-foreground hover:bg-muted flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold"
        >
          <Share2 aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
        <button
          type="button"
          aria-label={post.bookmarked ? "Remove saved post" : "Save post"}
          onClick={() => void toggleBookmark()}
          className={cn(
            "hover:bg-muted flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold",
            post.bookmarked ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Bookmark
            aria-hidden="true"
            className={cn("size-4", post.bookmarked && "fill-current")}
          />
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>
      {commentsOpen && (
        <div className="space-y-3 border-t px-4 py-3">
          {comments === null ? (
            <p className="text-muted-foreground text-xs">Loading comments...</p>
          ) : (
            comments.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5">
                <UserAvatar
                  name={item.author.displayName}
                  photoURL={item.author.photoURL}
                  className="size-8 shrink-0 rounded-full text-[10px]"
                />
                <div className="bg-muted min-w-0 flex-1 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold">
                      {item.author.displayName}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                      {item.editedAt
                        ? ` · edited ${formatDistanceToNow(new Date(item.editedAt), { addSuffix: true })}`
                        : ""}
                    </p>
                  </div>
                  {editingCommentId === item.id ? (
                    <div className="mt-1 space-y-1">
                      <textarea
                        value={commentDraft}
                        onChange={(event) =>
                          setCommentDraft(event.target.value)
                        }
                        rows={2}
                        maxLength={1000}
                        className="bg-background w-full resize-none rounded-lg px-2 py-1.5 text-xs outline-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCommentId(null)}
                          className="text-muted-foreground px-2 text-[11px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveCommentEdit(item.id)}
                          className="text-primary px-2 text-[11px] font-bold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs leading-5 wrap-break-word">
                      {item.content}
                    </p>
                  )}
                  {item.ownedByViewer && editingCommentId !== item.id && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(item.id);
                          setCommentDraft(item.content);
                        }}
                        className="text-muted-foreground text-[11px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeComment(item.id)}
                        className="text-destructive text-[11px]"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-2.5 pt-1">
            <UserAvatar
              name={viewer.displayName}
              photoURL={viewer.photoURL}
              className="size-8 shrink-0 rounded-full text-[10px]"
            />
            <div className="bg-muted flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2">
              <input
                value={comment}
                maxLength={1_000}
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addComment();
                }}
                placeholder="Write a comment..."
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => void addComment()}
                disabled={!comment.trim() || commenting}
                aria-label="Send comment"
                className="text-primary disabled:opacity-40"
              >
                <Send aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
