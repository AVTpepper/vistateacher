"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Eye,
  Flag,
  Heart,
  Lock,
  MessageSquare,
  Pin,
  Send,
  Tag,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { MentionText } from "@/features/mentions/mention-text";
import { MentionTextarea } from "@/features/mentions/mention-textarea";
import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
import type { ForumReply, ForumThreadDetail } from "@/lib/forum/server";
import type { MentionTarget } from "@/lib/mentions/types";
import type { UserRole } from "@/types/models";

export function ForumThreadExperience({
  initialData,
  viewer,
}: {
  initialData: ForumThreadDetail;
  viewer: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    role: UserRole;
  };
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [comment, setComment] = useState("");
  const [commentMentions, setCommentMentions] = useState<MentionTarget[]>([]);
  const [pending, setPending] = useState(false);
  const { thread, replies } = data;

  async function saveThreadEdit() {
    const nextTitle = window.prompt("Edit discussion title", thread.title);
    if (!nextTitle) return;
    const nextContent = window.prompt(
      "Edit discussion content",
      thread.content,
    );
    if (!nextContent) return;
    const nextTags = window.prompt(
      "Edit tags (comma-separated)",
      thread.tags.join(", "),
    );
    const response = await fetch(`/api/forum/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        content: nextContent,
        tags: (nextTags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 5),
      }),
    });
    if (!response.ok) return toast.error("We couldn't update this discussion.");
    toast.success("Discussion updated.");
    router.refresh();
  }

  async function saveReplyEdit(replyId: string, currentContent: string) {
    const nextContent = window.prompt("Edit comment", currentContent);
    if (!nextContent) return;
    const response = await fetch(`/api/forum/${thread.id}/replies/${replyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nextContent }),
    });
    if (!response.ok) return toast.error("We couldn't update that comment.");
    setData((current) => ({
      ...current,
      replies: current.replies.map((item) =>
        item.id === replyId
          ? {
              ...item,
              content: nextContent,
              editedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    toast.success("Comment updated.");
    router.refresh();
  }

  async function submitComment(
    parentReplyId: string | null,
    content: string,
    mentions: MentionTarget[],
  ): Promise<boolean> {
    setPending(true);
    const response = await fetch(`/api/forum/${thread.id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentReplyId,
        content,
        mentionUids: mentions.map((mention) => mention.uid),
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      replyId?: string;
      error?: string;
    } | null;
    setPending(false);
    if (!response.ok || !result?.replyId) {
      toast.error(result?.error ?? "We couldn't post this comment.");
      return false;
    }
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      thread: {
        ...current.thread,
        replyCount: current.thread.replyCount + 1,
      },
      replies: [
        ...current.replies,
        {
          id: result.replyId!,
          parentReplyId,
          author: {
            uid: viewer.uid,
            displayName: viewer.displayName,
            photoURL: viewer.photoURL,
            gradeLevel: "",
            school: "",
          },
          content,
          mentions,
          likeCount: 0,
          createdAt: now,
          updatedAt: now,
          editedAt: null,
          liked: false,
          accepted: false,
          ownedByViewer: true,
          canModerate: true,
        },
      ],
    }));
    if (!parentReplyId) {
      setComment("");
      setCommentMentions([]);
    }
    toast.success(parentReplyId ? "Reply posted." : "Comment posted.");
    router.refresh();
    return true;
  }

  async function toggleLike(replyId: string | null, liked: boolean) {
    if (replyId) {
      setData((current) => ({
        ...current,
        replies: current.replies.map((item) =>
          item.id === replyId
            ? {
                ...item,
                liked,
                likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)),
              }
            : item,
        ),
      }));
    } else {
      setData((current) => ({
        ...current,
        thread: {
          ...current.thread,
          liked,
          likeCount: Math.max(0, current.thread.likeCount + (liked ? 1 : -1)),
        },
      }));
    }
    const response = await fetch(`/api/forum/${thread.id}/like`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyId, liked }),
    });
    if (!response.ok) {
      toast.error("We couldn't update that reaction.");
      router.refresh();
    }
  }

  async function accept(replyId: string) {
    const response = await fetch(`/api/forum/${thread.id}/answer`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyId }),
    });
    if (!response.ok) return toast.error("We couldn't accept that comment.");
    toast.success("Best comment updated.");
    router.refresh();
  }

  async function moderate(action: "pin" | "unpin" | "lock" | "unlock") {
    const response = await fetch(`/api/forum/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) return toast.error("We couldn't update this discussion.");
    router.refresh();
  }

  async function deleteThread() {
    const response = await fetch(`/api/forum/${thread.id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("We couldn't delete this discussion.");
    toast.success("Discussion deleted.");
    router.push("/forum");
    router.refresh();
  }

  async function deleteReply(replyId: string) {
    const response = await fetch(`/api/forum/${thread.id}/replies/${replyId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("We couldn't delete that comment.");
    setData((current) => {
      const deletedIds = new Set([
        replyId,
        ...current.replies
          .filter((item) => item.parentReplyId === replyId)
          .map((item) => item.id),
      ]);
      return {
        ...current,
        thread: {
          ...current.thread,
          replyCount: Math.max(0, current.thread.replyCount - deletedIds.size),
        },
        replies: current.replies.filter((item) => !deletedIds.has(item.id)),
      };
    });
    toast.success("Comment deleted.");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/forum"
        className="text-muted-foreground hover:text-foreground mb-5 flex w-fit items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Forum
      </Link>

      <article className="surface-card mb-4 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {thread.pinned && (
            <span className="bg-primary/10 text-primary flex items-center gap-1 rounded-full px-2.5 py-1 font-bold">
              <Pin aria-hidden="true" className="size-3" /> Pinned
            </span>
          )}
          {thread.solved && (
            <span className="bg-success/10 text-success flex items-center gap-1 rounded-full px-2.5 py-1 font-bold">
              <CheckCircle2 aria-hidden="true" className="size-3" /> Solved
            </span>
          )}
          {thread.locked && (
            <span className="bg-muted text-muted-foreground flex items-center gap-1 rounded-full px-2.5 py-1 font-bold">
              <Lock aria-hidden="true" className="size-3" /> Locked
            </span>
          )}
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1">
            {thread.category.name}
          </span>
        </div>

        <h1 className="font-serif text-2xl leading-tight sm:text-3xl">
          {thread.title}
        </h1>
        {thread.editedAt && (
          <p className="text-muted-foreground mt-1 text-xs">Edited</p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <ProfileIdentityLink
            uid={thread.author.uid}
            displayName={thread.author.displayName}
            photoURL={thread.author.photoURL}
            avatarClassName="size-10 rounded-full text-xs"
            showName={false}
          />
          <div className="min-w-0">
            <ProfileIdentityLink
              uid={thread.author.uid}
              displayName={thread.author.displayName}
              photoURL={thread.author.photoURL}
              showAvatar={false}
              className="text-sm"
            />
            <p className="text-muted-foreground truncate text-xs">
              {thread.author.gradeLevel}
              {thread.author.school ? ` · ${thread.author.school}` : ""}
            </p>
          </div>
        </div>
        <p className="text-foreground/80 mt-5 text-sm leading-7 whitespace-pre-wrap">
          <MentionText content={thread.content} mentions={thread.mentions} />
        </p>
        {thread.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {thread.tags.map((tag) => (
              <span
                key={tag}
                className="bg-accent text-accent-foreground flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              >
                <Tag aria-hidden="true" className="size-3" /> {tag}
              </span>
            ))}
          </div>
        )}
        <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-4 border-t pt-4 text-sm">
          <button
            type="button"
            aria-pressed={thread.liked}
            onClick={() => void toggleLike(null, !thread.liked)}
            className={thread.liked ? "text-primary" : "hover:text-foreground"}
          >
            <span className="flex items-center gap-1.5">
              <Heart
                aria-hidden="true"
                className={`size-4 ${thread.liked ? "fill-current" : ""}`}
              />
              {thread.likeCount} {thread.likeCount === 1 ? "like" : "likes"}
            </span>
          </button>
          <span className="flex items-center gap-1.5">
            <Eye aria-hidden="true" className="size-4" />
            {thread.viewCount.toLocaleString()} views
          </span>
          <span className="flex items-center gap-1.5">
            <MessageSquare aria-hidden="true" className="size-4" />
            {thread.replyCount}{" "}
            {thread.replyCount === 1 ? "comment" : "comments"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ForumReportDialog threadId={thread.id} replyId={null} />
            {thread.canModerate && (
              <>
                {thread.ownedByViewer && !thread.locked && (
                  <IconButton
                    label="Edit discussion"
                    icon={MessageSquare}
                    onClick={() => void saveThreadEdit()}
                  />
                )}
                <IconButton
                  label={
                    thread.locked ? "Unlock discussion" : "Lock discussion"
                  }
                  icon={thread.locked ? Unlock : Lock}
                  onClick={() =>
                    void moderate(thread.locked ? "unlock" : "lock")
                  }
                />
                {viewer.role === "platform_admin" && (
                  <IconButton
                    label={
                      thread.pinned ? "Unpin discussion" : "Pin discussion"
                    }
                    icon={Pin}
                    onClick={() =>
                      void moderate(thread.pinned ? "unpin" : "pin")
                    }
                  />
                )}
                <DeleteConfirmDialog
                  itemName="discussion"
                  onConfirm={deleteThread}
                >
                  <button
                    type="button"
                    aria-label="Delete discussion"
                    title="Delete discussion"
                    className="text-destructive hover:bg-muted grid size-8 place-items-center rounded-lg"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </DeleteConfirmDialog>
              </>
            )}
          </div>
        </div>
      </article>

      <section className="mb-4 space-y-3">
        {replies
          .filter((item) => !item.parentReplyId)
          .map((item, index) => (
            <CommentCard
              key={item.id}
              reply={item}
              responses={replies.filter(
                (response) => response.parentReplyId === item.id,
              )}
              number={index + 1}
              canAccept={
                thread.ownedByViewer || viewer.role === "platform_admin"
              }
              onLike={(liked) => void toggleLike(item.id, liked)}
              onAccept={() => void accept(item.id)}
              onDelete={() => deleteReply(item.id)}
              onEdit={() => void saveReplyEdit(item.id, item.content)}
              onLikeResponse={(replyId, liked) =>
                void toggleLike(replyId, liked)
              }
              onDeleteResponse={(replyId) => deleteReply(replyId)}
              onEditResponse={(replyId, content) =>
                void saveReplyEdit(replyId, content)
              }
              onReply={(content, mentions) =>
                submitComment(item.id, content, mentions)
              }
              pending={pending}
              threadId={thread.id}
            />
          ))}
      </section>

      {thread.locked ? (
        <div className="surface-card text-muted-foreground p-5 text-center text-sm">
          This discussion is locked.
        </div>
      ) : (
        <section className="surface-card p-5">
          <h2 className="font-serif text-xl">Add Your Comment</h2>
          <div className="mt-4 flex items-start gap-3">
            <ProfileIdentityLink
              uid={viewer.uid}
              displayName={viewer.displayName}
              photoURL={viewer.photoURL}
              avatarClassName="size-9 rounded-full text-[10px]"
              showName={false}
            />
            <div className="min-w-0 flex-1">
              <MentionTextarea
                value={comment}
                onValueChange={setComment}
                mentions={commentMentions}
                onMentionsChange={setCommentMentions}
                excludeUid={viewer.uid}
                maxLength={5_000}
                rows={4}
                placeholder="Add your comment..."
                className="resource-input resize-none"
              />
              <button
                type="button"
                disabled={comment.trim().length < 3 || pending}
                onClick={() =>
                  void submitComment(null, comment, commentMentions)
                }
                className="bg-primary text-primary-foreground mt-3 ml-auto flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
              >
                <Send aria-hidden="true" className="size-4" />
                {pending ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function CommentCard({
  reply,
  responses,
  number,
  canAccept,
  onLike,
  onAccept,
  onDelete,
  onEdit,
  onLikeResponse,
  onDeleteResponse,
  onEditResponse,
  onReply,
  pending,
  threadId,
}: {
  reply: ForumReply;
  responses: ForumReply[];
  number: number;
  canAccept: boolean;
  onLike: (liked: boolean) => void;
  onAccept: () => void;
  onDelete: () => Promise<void>;
  onEdit: () => void;
  onLikeResponse: (replyId: string, liked: boolean) => void;
  onDeleteResponse: (replyId: string) => Promise<void>;
  onEditResponse: (replyId: string, content: string) => void;
  onReply: (content: string, mentions: MentionTarget[]) => Promise<boolean>;
  pending: boolean;
  threadId: string;
}) {
  const [replying, setReplying] = useState(false);
  const [response, setResponse] = useState("");
  const [responseMentions, setResponseMentions] = useState<MentionTarget[]>([]);

  async function submitResponse() {
    const posted = await onReply(response, responseMentions);
    if (!posted) return;
    setResponse("");
    setResponseMentions([]);
    setReplying(false);
  }

  return (
    <article
      id={`reply-${reply.id}`}
      className={`surface-card scroll-mt-24 p-5 ${reply.accepted ? "border-success/40 shadow-sm" : ""}`}
    >
      {reply.accepted && (
        <div className="text-success mb-3 flex items-center gap-1.5 text-xs font-bold">
          <Award aria-hidden="true" className="size-4" /> Best Comment
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ProfileIdentityLink
            uid={reply.author.uid}
            displayName={reply.author.displayName}
            photoURL={reply.author.photoURL}
            avatarClassName="size-9 rounded-full text-[10px]"
            showName={false}
          />
          <span className="text-muted-foreground font-mono text-[11px]">
            {number}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <ProfileIdentityLink
                uid={reply.author.uid}
                displayName={reply.author.displayName}
                photoURL={reply.author.photoURL}
                showAvatar={false}
                className="text-sm"
              />
              <span className="text-muted-foreground ml-2 text-xs">
                {formatDistanceToNow(new Date(reply.createdAt), {
                  addSuffix: true,
                })}
                {reply.editedAt ? " · edited" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {canAccept && !reply.accepted && (
                <IconButton
                  label="Accept as best comment"
                  icon={Award}
                  onClick={onAccept}
                />
              )}
              <ForumReportDialog threadId={threadId} replyId={reply.id} />
              {reply.canModerate && (
                <IconButton
                  label="Edit comment"
                  icon={MessageSquare}
                  onClick={onEdit}
                />
              )}
              {reply.canModerate && (
                <DeleteConfirmDialog itemName="comment" onConfirm={onDelete}>
                  <button
                    type="button"
                    aria-label="Delete comment"
                    title="Delete comment"
                    className="text-destructive hover:bg-muted grid size-8 place-items-center rounded-lg"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </DeleteConfirmDialog>
              )}
            </div>
          </div>
          <p className="text-foreground/80 mt-3 text-sm leading-6 whitespace-pre-wrap">
            <MentionText content={reply.content} mentions={reply.mentions} />
          </p>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 border-t pt-3 text-xs">
            <button
              type="button"
              aria-pressed={reply.liked}
              onClick={() => onLike(!reply.liked)}
              className={`flex items-center gap-1.5 ${reply.liked ? "text-primary" : "hover:text-primary"}`}
            >
              <Heart
                aria-hidden="true"
                className={`size-3.5 ${reply.liked ? "fill-current" : ""}`}
              />
              {reply.likeCount} {reply.likeCount === 1 ? "like" : "likes"}
            </button>
            <button
              type="button"
              aria-expanded={replying}
              onClick={() => setReplying((current) => !current)}
              className="hover:text-primary flex items-center gap-1.5"
            >
              <MessageSquare aria-hidden="true" className="size-3.5" />
              Reply
            </button>
          </div>
          {replying && (
            <div className="bg-muted/35 mt-3 rounded-xl border p-3">
              <MentionTextarea
                value={response}
                onValueChange={setResponse}
                mentions={responseMentions}
                onMentionsChange={setResponseMentions}
                maxLength={5_000}
                rows={3}
                placeholder={`Reply to ${reply.author.displayName}...`}
                className="resource-input resize-none"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplying(false)}
                  className="h-9 rounded-lg border px-3 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={response.trim().length < 3 || pending}
                  onClick={() => void submitResponse()}
                  className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-50"
                >
                  {pending ? "Posting..." : "Post Reply"}
                </button>
              </div>
            </div>
          )}
          {responses.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 pl-3 sm:pl-4">
              {responses.map((responseItem) => (
                <CommentResponse
                  key={responseItem.id}
                  reply={responseItem}
                  onLike={(liked) => onLikeResponse(responseItem.id, liked)}
                  onDelete={() => onDeleteResponse(responseItem.id)}
                  onEdit={() =>
                    onEditResponse(responseItem.id, responseItem.content)
                  }
                  threadId={threadId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function CommentResponse({
  reply,
  onLike,
  onDelete,
  onEdit,
  threadId,
}: {
  reply: ForumReply;
  onLike: (liked: boolean) => void;
  onDelete: () => Promise<void>;
  onEdit: () => void;
  threadId: string;
}) {
  return (
    <article id={`reply-${reply.id}`} className="scroll-mt-24 py-1">
      <div className="flex items-start gap-3">
        <ProfileIdentityLink
          uid={reply.author.uid}
          displayName={reply.author.displayName}
          photoURL={reply.author.photoURL}
          avatarClassName="size-8 rounded-full text-[9px]"
          showName={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <ProfileIdentityLink
                uid={reply.author.uid}
                displayName={reply.author.displayName}
                photoURL={reply.author.photoURL}
                showAvatar={false}
                className="text-xs"
              />
              <span className="text-muted-foreground ml-2 text-[11px]">
                {formatDistanceToNow(new Date(reply.createdAt), {
                  addSuffix: true,
                })}
                {reply.editedAt ? " · edited" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <ForumReportDialog threadId={threadId} replyId={reply.id} />
              {reply.ownedByViewer && (
                <IconButton
                  label="Edit comment"
                  icon={MessageSquare}
                  onClick={onEdit}
                />
              )}
              {reply.canModerate && (
                <DeleteConfirmDialog itemName="comment" onConfirm={onDelete}>
                  <button
                    type="button"
                    aria-label="Delete comment"
                    title="Delete comment"
                    className="text-destructive hover:bg-muted grid size-8 place-items-center rounded-lg"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </button>
                </DeleteConfirmDialog>
              )}
            </div>
          </div>
          <p className="text-foreground/80 mt-2 text-sm leading-6 whitespace-pre-wrap">
            <MentionText content={reply.content} mentions={reply.mentions} />
          </p>
          <button
            type="button"
            aria-pressed={reply.liked}
            onClick={() => onLike(!reply.liked)}
            className={`mt-2 flex items-center gap-1.5 text-xs ${reply.liked ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
          >
            <Heart
              aria-hidden="true"
              className={`size-3.5 ${reply.liked ? "fill-current" : ""}`}
            />
            {reply.likeCount} {reply.likeCount === 1 ? "like" : "likes"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ForumReportDialog({
  threadId,
  replyId,
}: {
  threadId: string;
  replyId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const response = await fetch(`/api/forum/${threadId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyId, reason, details }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setPending(false);
    if (!response.ok)
      return toast.error(result?.error ?? "We couldn't submit this report.");
    setOpen(false);
    setDetails("");
    toast.success("Report submitted.");
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Dialog.Trigger
        aria-label={replyId ? "Report comment" : "Report discussion"}
        title={replyId ? "Report comment" : "Report discussion"}
        className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-11 place-items-center rounded-lg"
      >
        <Flag aria-hidden="true" className="size-4" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-2xl">
          <Dialog.Title className="font-serif text-xl">
            Report content
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Send this content to platform moderators.
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close report"
            className="text-muted-foreground hover:bg-muted absolute top-2.5 right-2.5 grid size-11 place-items-center rounded-lg"
          >
            <X aria-hidden="true" className="size-4" />
          </Dialog.Close>
          <label className="mt-4 block text-xs font-semibold">
            <span className="text-muted-foreground mb-1.5 block">Reason</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="resource-input"
            >
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="misinformation">Misinformation</option>
              <option value="unsafe">Unsafe content</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="mt-4 block text-xs font-semibold">
            <span className="text-muted-foreground mb-1.5 block">Details</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={500}
              rows={3}
              className="resource-input resize-none"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
            className="bg-primary text-primary-foreground mt-5 h-10 w-full rounded-lg text-sm font-bold disabled:opacity-50"
          >
            {pending ? "Submitting..." : "Submit report"}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  destructive = false,
}: {
  label: string;
  icon: typeof Lock;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`hover:bg-muted grid size-8 place-items-center rounded-lg ${destructive ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
