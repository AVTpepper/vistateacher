"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Bookmark,
  ExternalLink,
  FileText,
  Heart,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Send,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/http/client";
import { toast } from "sonner";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { MentionText } from "@/features/mentions/mention-text";
import { MentionTextarea } from "@/features/mentions/mention-textarea";
import { PostImageViewer } from "@/features/feed/post-image-viewer";
import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
import { formatPostFileSize } from "@/lib/feed/attachments";
import type { FeedComment, FeedPost } from "@/lib/feed/server";
import type { MentionTarget } from "@/lib/mentions/types";
import { cn } from "@/lib/utils";

interface PostCardProps {
  initialPost: FeedPost;
  initialComments?: FeedComment[];
  viewer: { uid: string; displayName: string; photoURL: string | null };
  onDelete?: (postId: string, restore?: FeedPost) => void;
  onBookmarkRemoved?: (postId: string) => void;
}

const typeStyle = {
  post: "bg-primary/10 text-primary",
  resource: "bg-success/10 text-success",
  question: "bg-accent/10 text-accent-readable",
  activity: "bg-accent text-accent-foreground",
};

const typeLabel = {
  post: "Post",
  resource: "Resource Share",
  question: "Question",
  activity: "Activity",
};

function linkHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

async function mutation(url: string, method: string, body?: unknown) {
  return requestJson(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function PostCard({ initialPost, ...props }: PostCardProps) {
  if (initialPost.type === "activity")
    return initialPost.activity ? (
      <ActivityFeedItem post={initialPost} />
    ) : null;

  return <InteractivePostCard initialPost={initialPost} {...props} />;
}

function ActivityFeedItem({ post }: { post: FeedPost }) {
  const activity = post.activity;
  if (!activity) return null;

  const ActivityIcon =
    activity.kind === "forum-thread"
      ? MessageSquareText
      : activity.kind === "lesson-published"
        ? Sparkles
        : FileText;
  const activityLabel = `${activity.label.charAt(0).toLocaleLowerCase("en-US")}${activity.label.slice(1)}`;

  return (
    <article className="border-primary/25 flex max-w-full min-w-0 items-start gap-3 rounded-xl border-l-2 py-4 pr-4 pl-3.5">
      <ProfileIdentityLink
        uid={post.author.uid}
        displayName={post.author.displayName}
        photoURL={post.author.photoURL}
        avatarClassName="size-10 rounded-full text-xs"
        showName={false}
      />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-baseline text-sm leading-5">
          <ProfileIdentityLink
            uid={post.author.uid}
            displayName={post.author.displayName}
            photoURL={post.author.photoURL}
            showAvatar={false}
            className="mr-1 max-w-full text-sm"
          />
          <span className="text-muted-foreground min-w-0 [overflow-wrap:anywhere]">
            {activityLabel}.
          </span>
        </p>
        <Link
          href={activity.href}
          className="hover:text-primary mt-1 flex max-w-full min-w-0 items-start gap-1.5 text-left text-sm font-semibold transition-colors"
        >
          <ActivityIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span className="min-w-0 [overflow-wrap:anywhere] whitespace-normal">
            {activity.title}
          </span>
        </Link>
        <time
          dateTime={post.createdAt}
          className="text-muted-foreground mt-1 block text-xs"
        >
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </time>
      </div>
    </article>
  );
}

function InteractivePostCard({
  initialPost,
  initialComments,
  viewer,
  onDelete,
  onBookmarkRemoved,
}: PostCardProps) {
  const router = useRouter();
  const locks = useRef(new Set<string>());
  const [busy, setBusy] = useState<string[]>([]);
  const [post, setPost] = useState(initialPost);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(
    initialComments !== undefined,
  );
  const [comments, setComments] = useState<FeedComment[] | null>(
    initialComments ?? null,
  );
  const [comment, setComment] = useState("");
  const [commentMentions, setCommentMentions] = useState<MentionTarget[]>([]);
  const [commenting, setCommenting] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [postDraft, setPostDraft] = useState(initialPost.content);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [postEditMentions, setPostEditMentions] = useState(
    initialPost.mentions,
  );
  const [commentEditMentions, setCommentEditMentions] = useState<
    MentionTarget[]
  >([]);

  async function runAction(key: string, action: () => Promise<void>) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setBusy([...locks.current]);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please try again.");
    } finally {
      locks.current.delete(key);
      setBusy([...locks.current]);
    }
  }

  async function toggleLike() {
    await runAction("like", async () => {
      const liked = !post.liked;
      setPost((current) => ({
        ...current,
        liked,
        likeCount: Math.max(0, current.likeCount + (liked ? 1 : -1)),
      }));
      try {
        await mutation(`/api/feed/${post.id}/like`, liked ? "PUT" : "DELETE");
      } catch (error) {
        setPost((current) => ({
          ...current,
          liked: !liked,
          likeCount: Math.max(0, current.likeCount + (liked ? -1 : 1)),
        }));
        throw error;
      }
    });
  }

  async function toggleBookmark() {
    await runAction("bookmark", async () => {
      const bookmarked = !post.bookmarked;
      setPost((current) => ({
        ...current,
        bookmarked,
        bookmarkCount: Math.max(
          0,
          current.bookmarkCount + (bookmarked ? 1 : -1),
        ),
      }));
      try {
        await mutation(
          `/api/feed/${post.id}/bookmark`,
          bookmarked ? "PUT" : "DELETE",
        );
      } catch (error) {
        setPost((current) => ({
          ...current,
          bookmarked: !bookmarked,
          bookmarkCount: Math.max(
            0,
            current.bookmarkCount + (bookmarked ? -1 : 1),
          ),
        }));
        throw error;
      }
      if (!bookmarked) onBookmarkRemoved?.(post.id);
    });
  }

  async function loadComments() {
    if (locks.current.has("comments")) return;
    setCommentsError(null);
    await runAction("comments", async () => {
      try {
        const result = await requestJson<{ comments: FeedComment[] }>(
          `/api/feed/${post.id}/comments`,
        );
        setComments(result.comments);
      } catch (error) {
        setCommentsError(
          error instanceof Error ? error.message : "Comments couldn't load.",
        );
      }
    });
  }

  async function openComments() {
    setCommentsOpen((open) => !open);
    if (!commentsOpen && comments === null) await loadComments();
  }

  async function addComment() {
    const content = comment.trim();
    if (!content || locks.current.has("comment")) return;
    await runAction("comment", async () => {
      setCommenting(true);
      const selectedMentions = commentMentions;
      try {
        const result = await requestJson<{ commentId: string }>(
          `/api/feed/${post.id}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              mentionUids: selectedMentions.map((mention) => mention.uid),
            }),
          },
        );
        if (!result.commentId)
          throw new Error(
            "Comment could not be confirmed. Refresh before retrying.",
          );
        const now = new Date().toISOString();
        setComments((current) => [
          ...(current ?? []),
          {
            id: result.commentId,
            author: { ...viewer, gradeLevel: "", school: "" },
            content,
            mentions: selectedMentions,
            createdAt: now,
            updatedAt: now,
            editedAt: null,
            ownedByViewer: true,
          },
        ]);
        setPost((current) => ({
          ...current,
          commentCount: current.commentCount + 1,
        }));
        setComment("");
        setCommentMentions([]);
      } finally {
        setCommenting(false);
      }
    });
  }

  async function removePost(): Promise<void> {
    await mutation(`/api/feed/${post.id}`, "DELETE");
    setMenuOpen(false);
    if (onDelete) onDelete(post.id);
    else {
      router.replace("/app");
      router.refresh();
    }
    toast.success("Post deleted.");
  }

  async function savePostEdit() {
    const content = postDraft.trim();
    if (!content) return;
    await runAction("edit-post", async () => {
      await mutation(`/api/feed/${post.id}`, "PATCH", {
        type: post.type,
        content,
        imageURLs: post.imageURLs,
        fileAttachments: post.fileAttachments,
        linkURLs: post.linkURLs,
        tags: post.tags,
        resourceId: post.resourceId,
        mentionUids: postEditMentions.map((mention) => mention.uid),
      });
      setPost((current) => ({
        ...current,
        content,
        mentions: postEditMentions,
        updatedAt: new Date().toISOString(),
        editedAt: new Date().toISOString(),
      }));
      setEditingPost(false);
      toast.success("Post updated.");
    });
  }

  async function saveCommentEdit(commentId: string) {
    const content = commentDraft.trim();
    if (!content) return;
    await runAction("edit-comment", async () => {
      await mutation(`/api/feed/${post.id}/comments/${commentId}`, "PATCH", {
        content,
        mentionUids: commentEditMentions.map((mention) => mention.uid),
      });
      setComments(
        (current) =>
          current?.map((item) =>
            item.id === commentId
              ? {
                  ...item,
                  content,
                  mentions: commentEditMentions,
                  updatedAt: new Date().toISOString(),
                  editedAt: new Date().toISOString(),
                }
              : item,
          ) ?? [],
      );
      setEditingCommentId(null);
      setCommentDraft("");
      toast.success("Comment updated.");
    });
  }

  async function removeComment(commentId: string): Promise<void> {
    await mutation(`/api/feed/${post.id}/comments/${commentId}`, "DELETE");
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
    await runAction("report", async () => {
      await mutation(`/api/feed/${post.id}/report`, "POST", {
        reason: "other",
        details: "Reported from the feed.",
      });
      toast.success("Report submitted for review.");
    });
  }

  async function share() {
    const url = `${window.location.origin}/post/${encodeURIComponent(post.id)}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "VistaTeacher post", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Post link copied.");
      }
      const result = await mutation(`/api/feed/${post.id}/share`, "POST");
      if (result.counted)
        setPost((current) => ({
          ...current,
          shareCount: current.shareCount + 1,
        }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error("We couldn't share this post.");
    }
  }

  return (
    <article className="surface-card surface-card-interactive overflow-hidden">
      <header className="flex items-start gap-3 p-4 pb-3">
        <ProfileIdentityLink
          uid={post.author.uid}
          displayName={post.author.displayName}
          photoURL={post.author.photoURL}
          avatarClassName="size-10 rounded-full text-xs"
          showName={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProfileIdentityLink
              uid={post.author.uid}
              displayName={post.author.displayName}
              photoURL={post.author.photoURL}
              showAvatar={false}
              className="text-sm"
            />
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
        <DropdownMenu.Root
          modal={false}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Post options"
              aria-expanded={menuOpen}
              className="text-muted-foreground hover:bg-muted grid size-11 place-items-center rounded-lg"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="bg-popover z-40 w-48 rounded-xl border p-1 shadow-lg"
            >
              <DropdownMenu.Item asChild>
                <button
                  type="button"
                  disabled={busy.includes("bookmark")}
                  onClick={() => void toggleBookmark()}
                  className="hover:bg-muted min-h-11 w-full px-3 py-2 text-left text-sm"
                >
                  {post.bookmarked ? "Remove saved post" : "Save post"}
                </button>
              </DropdownMenu.Item>
              {!post.ownedByViewer && (
                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    onClick={() => void report()}
                    className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                  >
                    Report
                  </button>
                </DropdownMenu.Item>
              )}
              {post.ownedByViewer && post.type !== "activity" && (
                <DropdownMenu.Item asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setPostDraft(post.content);
                      setPostEditMentions(post.mentions);
                      setEditingPost(true);
                    }}
                    className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    <Pencil aria-hidden="true" className="size-3.5" /> Edit
                  </button>
                </DropdownMenu.Item>
              )}
              {post.ownedByViewer && post.type !== "activity" && (
                <DeleteConfirmDialog itemName="post" onConfirm={removePost}>
                  <DropdownMenu.Item
                    asChild
                    onSelect={(event) => event.preventDefault()}
                  >
                    <button
                      type="button"
                      className="text-destructive hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" /> Delete
                    </button>
                  </DropdownMenu.Item>
                </DeleteConfirmDialog>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      <div className="px-4 pb-3">
        {post.type === "activity" && post.activity ? (
          <Link
            href={post.activity.href}
            className="bg-muted/35 hover:border-primary/25 block min-w-0 rounded-xl border p-4 transition-colors"
          >
            <span className="text-muted-foreground block min-w-0 text-xs font-semibold [overflow-wrap:anywhere]">
              {post.activity.label}
            </span>
            <span className="mt-1 block min-w-0 font-serif text-xl leading-7 [overflow-wrap:anywhere]">
              {post.activity.title}
            </span>
            <span className="text-primary mt-2 block text-xs font-bold">
              View activity
            </span>
          </Link>
        ) : editingPost ? (
          <div className="space-y-2">
            <MentionTextarea
              aria-label="Edit post"
              mentions={postEditMentions}
              onMentionsChange={setPostEditMentions}
              excludeUid={viewer.uid}
              disabled={busy.includes("edit-post")}
              name="post-edit"
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck
              inputMode="text"
              value={postDraft}
              onValueChange={setPostDraft}
              maxLength={5000}
              rows={4}
              className="bg-muted w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPost(false)}
                disabled={busy.includes("edit-post")}
                className="h-11 rounded-xl border px-4 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePostEdit()}
                disabled={!postDraft.trim() || busy.includes("edit-post")}
                className="bg-primary text-primary-foreground h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 whitespace-pre-line">
            <MentionText content={post.content} mentions={post.mentions} />
          </p>
        )}
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="bg-accent text-accent-foreground rounded-full px-2.5 py-1 text-xs font-semibold"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {post.imageURLs[0] && <PostImageViewer src={post.imageURLs[0]} />}
      {(post.fileAttachments.length > 0 || post.linkURLs.length > 0) && (
        <div className="mx-4 mb-3 space-y-2">
          {post.fileAttachments.map((attachment) => (
            <a
              key={attachment.url}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open attached file ${attachment.name}`}
              className="bg-muted/50 hover:border-primary/30 flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
            >
              <span className="bg-background text-primary grid size-9 shrink-0 place-items-center rounded-lg border">
                <FileText aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {attachment.name}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {formatPostFileSize(attachment.size)}
                </span>
              </span>
              <ExternalLink
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
            </a>
          ))}
          {post.linkURLs.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open shared web link to ${linkHost(url)}`}
              className="bg-muted/50 hover:border-primary/30 flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
            >
              <span className="bg-background text-primary grid size-9 shrink-0 place-items-center rounded-lg border">
                <Paperclip aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {linkHost(url)}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {url}
                </span>
              </span>
              <ExternalLink
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
            </a>
          ))}
        </div>
      )}
      <div className="text-muted-foreground mx-4 flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
        <button
          type="button"
          disabled={busy.includes("like")}
          onClick={() => void toggleLike()}
          className="hover:bg-muted focus-visible:text-foreground min-h-11 rounded-lg px-2 transition-colors"
        >
          {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
        </button>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void openComments()}
            className="hover:bg-muted focus-visible:text-foreground min-h-11 rounded-lg px-2 transition-colors"
          >
            {post.commentCount}{" "}
            {post.commentCount === 1 ? "comment" : "comments"}
          </button>
          <span className="px-2">
            {post.shareCount} {post.shareCount === 1 ? "share" : "shares"}
          </span>
          <span className="px-2">{post.bookmarkCount} saved</span>
        </span>
      </div>
      <div className="flex px-2 py-1">
        <button
          type="button"
          aria-label={post.liked ? "Unlike post" : "Like post"}
          onClick={() => void toggleLike()}
          className={cn(
            "hover:bg-muted flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold",
            post.liked ? "text-primary" : "text-muted-foreground",
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
          {commentsError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{commentsError}</p>
              <Button
                variant="outline"
                disabled={busy.includes("comments")}
                onClick={() => void loadComments()}
              >
                Retry comments
              </Button>
            </div>
          ) : comments === null ? (
            <p className="text-muted-foreground text-xs">Loading comments...</p>
          ) : (
            comments.map((item) => (
              <div
                id={`comment-${item.id}`}
                key={item.id}
                className="flex scroll-mt-24 items-start gap-2.5"
              >
                <ProfileIdentityLink
                  uid={item.author.uid}
                  displayName={item.author.displayName}
                  photoURL={item.author.photoURL}
                  avatarClassName="size-8 rounded-full text-[10px]"
                  showName={false}
                />
                <div className="bg-muted min-w-0 flex-1 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <ProfileIdentityLink
                      uid={item.author.uid}
                      displayName={item.author.displayName}
                      photoURL={item.author.photoURL}
                      showAvatar={false}
                      className="text-xs"
                    />
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
                      <MentionTextarea
                        aria-label="Edit comment"
                        mentions={commentEditMentions}
                        onMentionsChange={setCommentEditMentions}
                        excludeUid={viewer.uid}
                        disabled={busy.includes("edit-comment")}
                        name="comment-edit"
                        autoComplete="off"
                        autoCapitalize="sentences"
                        spellCheck
                        inputMode="text"
                        value={commentDraft}
                        onValueChange={setCommentDraft}
                        rows={2}
                        maxLength={1000}
                        className="bg-background w-full resize-none rounded-lg px-2 py-1.5 text-xs outline-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCommentId(null)}
                          disabled={busy.includes("edit-comment")}
                          className="text-muted-foreground min-h-11 rounded-lg px-3 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveCommentEdit(item.id)}
                          disabled={
                            !commentDraft.trim() ||
                            busy.includes("edit-comment")
                          }
                          className="text-primary min-h-11 rounded-lg px-3 text-xs font-bold disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs leading-5 wrap-break-word">
                      <MentionText
                        content={item.content}
                        mentions={item.mentions}
                      />
                    </p>
                  )}
                  {item.ownedByViewer && editingCommentId !== item.id && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(item.id);
                          setCommentDraft(item.content);
                          setCommentEditMentions(item.mentions);
                        }}
                        className="text-muted-foreground hover:bg-background min-h-11 rounded-lg px-3 text-xs"
                      >
                        Edit
                      </button>
                      <DeleteConfirmDialog
                        itemName="comment"
                        onConfirm={() => removeComment(item.id)}
                      >
                        <button
                          type="button"
                          className="text-destructive hover:bg-background min-h-11 rounded-lg px-3 text-xs"
                        >
                          Delete
                        </button>
                      </DeleteConfirmDialog>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-2.5 pt-1">
            <ProfileIdentityLink
              uid={viewer.uid}
              displayName={viewer.displayName}
              photoURL={viewer.photoURL}
              avatarClassName="size-8 rounded-full text-[10px]"
              showName={false}
            />
            <div className="input-shell bg-muted flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-3 py-2">
              <MentionTextarea
                name="comment"
                autoComplete="off"
                autoCapitalize="sentences"
                spellCheck
                inputMode="text"
                enterKeyHint="send"
                disabled={commenting}
                value={comment}
                mentions={commentMentions}
                onMentionsChange={setCommentMentions}
                excludeUid={viewer.uid}
                maxLength={1_000}
                onValueChange={setComment}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void addComment();
                  }
                }}
                placeholder="Write a comment..."
                rows={1}
                className="placeholder:text-muted-foreground min-h-6 resize-none border-0 bg-transparent text-base shadow-none outline-none md:text-sm"
              />
              <button
                type="button"
                onClick={() => void addComment()}
                disabled={!comment.trim() || commenting}
                aria-label="Send comment"
                className="text-primary grid size-11 shrink-0 place-items-center rounded-lg disabled:opacity-40"
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
