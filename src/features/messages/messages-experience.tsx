"use client";

import {
  ArrowLeft,
  Ban,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { NewConversationDialog } from "@/features/messages/new-conversation-dialog";
import { ReportMessageDialog } from "@/features/messages/report-message-dialog";
import { getFirebaseClient } from "@/lib/firebase/client";
import type {
  ConversationSummary,
  DirectMessage,
  MessagePage,
} from "@/lib/messages/server";
import { cn } from "@/lib/utils";

export function MessagesExperience({
  viewer,
  initialConversations,
  initialConversationId,
  initialComposeUid,
  initialMessages,
}: {
  viewer: { uid: string; displayName: string; photoURL: string | null };
  initialConversations: ConversationSummary[];
  initialConversationId: string | null;
  initialComposeUid: string | null;
  initialMessages: MessagePage | null;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversationId);
  const [messagePage, setMessagePage] = useState<MessagePage>(
    initialMessages ?? { messages: [], nextCursor: null },
  );
  const [search, setSearch] = useState("");
  const [mobileChat, setMobileChat] = useState(Boolean(initialConversationId));
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const active = conversations.find((item) => item.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId) return;
    const messagesQuery = query(
      collection(getFirebaseClient().db, `conversations/${activeId}/messages`),
      orderBy("createdAt", "desc"),
      limit(20),
    );
    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messages = snapshot.docs.map((document) => {
          const data = document.data();
          const createdAt = data.createdAt?.toDate?.() as Date | undefined;
          return {
            id: document.id,
            conversationId: activeId,
            senderId: String(data.senderId),
            content: String(data.content ?? ""),
            attachment:
              data.attachment && typeof data.attachment === "object"
                ? {
                    id: String(data.attachment.id),
                    fileName: String(data.attachment.fileName),
                    fileType: String(data.attachment.fileType),
                    fileSize: Number(data.attachment.fileSize) || 0,
                  }
                : null,
            readBy: Array.isArray(data.readBy) ? data.readBy.map(String) : [],
            createdAt: (createdAt ?? new Date()).toISOString(),
            updatedAt:
              (data.updatedAt?.toDate?.() as Date | undefined)?.toISOString() ??
              (createdAt ?? new Date()).toISOString(),
            editedAt:
              (data.editedAt?.toDate?.() as Date | undefined)?.toISOString() ??
              null,
            deletedAt:
              (data.deletedAt?.toDate?.() as Date | undefined)?.toISOString() ??
              null,
          } satisfies DirectMessage;
        });
        setMessagePage((current) => {
          const merged = new Map(
            current.messages.map((message) => [message.id, message]),
          );
          for (const message of messages) merged.set(message.id, message);
          return {
            ...current,
            messages: [...merged.values()].sort((first, second) =>
              first.createdAt.localeCompare(second.createdAt),
            ),
          };
        });
        setConversations((current) =>
          current.map((item) =>
            item.id === activeId ? { ...item, unreadCount: 0 } : item,
          ),
        );
        void fetch(`/api/messages/${activeId}`, { method: "PATCH" });
      },
      () => undefined,
    );
  }, [activeId]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messagePage.messages.length]);

  async function selectConversation(conversation: ConversationSummary) {
    const response = await fetch(`/api/messages/${conversation.id}`);
    const result = (await response
      .json()
      .catch(() => null)) as MessagePage | null;
    if (!response.ok || !result)
      return toast.error("We couldn't load this conversation.");
    setActiveId(conversation.id);
    setMessagePage(result);
    setMobileChat(true);
    router.replace(`/messages?conversation=${conversation.id}`, {
      scroll: false,
    });
  }

  async function loadOlder() {
    if (!activeId || !messagePage.nextCursor || loadingHistory) return;
    setLoadingHistory(true);
    const response = await fetch(
      `/api/messages/${activeId}?cursor=${encodeURIComponent(messagePage.nextCursor)}`,
    );
    const result = (await response
      .json()
      .catch(() => null)) as MessagePage | null;
    setLoadingHistory(false);
    if (!response.ok || !result)
      return toast.error("We couldn't load older messages.");
    setMessagePage((current) => {
      const merged = new Map(
        [...result.messages, ...current.messages].map((message) => [
          message.id,
          message,
        ]),
      );
      return {
        messages: [...merged.values()].sort((first, second) =>
          first.createdAt.localeCompare(second.createdAt),
        ),
        nextCursor: result.nextCursor,
      };
    });
  }

  async function sendMessage() {
    if (!activeId || pending || (!content.trim() && !attachment)) return;
    setPending(true);
    let reservedAttachmentId: string | null = null;
    try {
      if (attachment) {
        const response = await fetch(`/api/messages/${activeId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: attachment.name,
            fileType: attachment.type,
            fileSize: attachment.size,
          }),
        });
        const reservation = (await response.json().catch(() => null)) as {
          attachmentId?: string;
          uploadPath?: string;
          error?: string;
        } | null;
        if (
          !response.ok ||
          !reservation?.attachmentId ||
          !reservation.uploadPath
        )
          throw new Error(
            reservation?.error ?? "Attachment reservation failed.",
          );
        reservedAttachmentId = reservation.attachmentId;
        await uploadBytes(
          ref(getFirebaseClient().storage, reservation.uploadPath),
          attachment,
          { contentType: attachment.type },
        );
      }
      const response = await fetch(`/api/messages/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          attachmentId: reservedAttachmentId,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(result?.error ?? "Message failed.");
      setContent("");
      setAttachment(null);
      textarea.current?.blur();
      reservedAttachmentId = null;
    } catch (error) {
      if (reservedAttachmentId)
        void fetch(
          `/api/messages/${activeId}/attachments/${reservedAttachmentId}`,
          { method: "DELETE" },
        );
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't send that message.",
      );
    } finally {
      setPending(false);
    }
  }

  async function toggleBlock() {
    if (!active) return;
    const blocked = !active.blockedByViewer;
    const response = await fetch("/api/messages/blocks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedUid: active.participant.uid, blocked }),
    });
    if (!response.ok) return toast.error("We couldn't update this block.");
    setConversations((current) =>
      current.map((item) =>
        item.id === active.id ? { ...item, blockedByViewer: blocked } : item,
      ),
    );
    toast.success(blocked ? "Educator blocked." : "Educator unblocked.");
  }

  async function editMessage(message: DirectMessage) {
    if (!activeId) return;
    const nextContent = window.prompt("Edit message", message.content);
    if (!nextContent) return;
    const response = await fetch(`/api/messages/${activeId}/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nextContent }),
    });
    if (!response.ok) return toast.error("We couldn't edit that message.");
    toast.success("Message updated.");
  }

  async function removeMessage(message: DirectMessage): Promise<void> {
    if (!activeId) return;
    const response = await fetch(`/api/messages/${activeId}/${message.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("We couldn't delete that message.");
      return;
    }
    toast.success("Message deleted.");
  }

  const filtered = conversations.filter((item) =>
    item.participant.displayName.toLowerCase().includes(search.toLowerCase()),
  );
  const unread = conversations.reduce(
    (total, item) => total + item.unreadCount,
    0,
  );

  return (
    <div className="messages-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
      <div className="surface-card flex h-full min-h-[min(44rem,calc(100dvh-7.5rem))] overflow-hidden lg:min-h-[calc(100dvh-9.5rem)]">
        <section
          aria-label="Conversations"
          className={cn(
            "border-border/70 bg-card/40 w-full shrink-0 flex-col border-r lg:flex lg:w-88 xl:w-96",
            mobileChat ? "hidden" : "flex",
          )}
        >
          <div className="border-border/70 border-b p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-primary text-[11px] font-bold tracking-[0.14em] uppercase">
                  Inbox
                </p>
                <h1 className="font-serif text-2xl tracking-tight">Messages</h1>
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-1 text-xs font-bold shadow-sm">
                    {unread} new
                  </span>
                )}
                <NewConversationDialog
                  viewerUid={viewer.uid}
                  initialRecipientUid={initialComposeUid}
                />
              </div>
            </div>
            <label className="surface-inset flex min-h-11 items-center gap-2 px-3">
              <Search
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
              <span className="sr-only">Search messages</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search educators..."
                className="placeholder:text-muted-foreground/80 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            {filtered.length ? (
              <div className="space-y-1.5">
                {filtered.map((conversation) => {
                  const selected = activeId === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => void selectConversation(conversation)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-200",
                        selected
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "hover:bg-muted/80 text-foreground",
                      )}
                    >
                      <div className="relative shrink-0">
                        <UserAvatar
                          name={conversation.participant.displayName}
                          photoURL={conversation.participant.photoURL}
                          className={cn(
                            "size-12 rounded-2xl text-xs",
                            selected && "ring-2 ring-white/30",
                          )}
                        />
                        {conversation.unreadCount > 0 && !selected && (
                          <span className="bg-accent ring-card absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={cn(
                              "truncate text-sm font-bold",
                              selected ? "text-white" : "text-foreground",
                            )}
                          >
                            {conversation.participant.displayName}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-medium",
                              selected
                                ? "text-white/70"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatDistanceToNow(
                              new Date(conversation.lastMessageAt),
                              { addSuffix: true },
                            )}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-xs leading-5",
                            selected
                              ? "text-white/75"
                              : "text-muted-foreground",
                            conversation.unreadCount > 0 &&
                              !selected &&
                              "text-foreground font-semibold",
                          )}
                        >
                          {conversation.lastMessagePreview || "No messages yet"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid h-full min-h-56 place-items-center px-4 py-10 text-center">
                <div>
                  <span className="icon-well mx-auto size-12">
                    <MessageCircle aria-hidden="true" className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">
                    {search
                      ? "No matching conversations"
                      : "No conversations yet"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {search
                      ? "Try another name or clear your search."
                      : "Start a conversation with an educator in your network."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          aria-label="Active conversation"
          className={cn(
            "relative min-w-0 flex-1 flex-col",
            mobileChat ? "flex" : "hidden lg:flex",
          )}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_8%,transparent),transparent_40%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent)_6%,transparent),transparent_35%)]"
          />
          {active ? (
            <>
              <header className="border-border/70 bg-card/70 relative z-10 flex h-16 shrink-0 items-center gap-3 border-b px-3 backdrop-blur-md sm:px-5">
                <button
                  type="button"
                  aria-label="Back to conversations"
                  onClick={() => setMobileChat(false)}
                  className="text-muted-foreground hover:bg-muted grid size-11 place-items-center rounded-xl lg:hidden"
                >
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </button>
                <ProfileIdentityLink
                  uid={active.participant.uid}
                  displayName={active.participant.displayName}
                  photoURL={active.participant.photoURL}
                  avatarClassName="size-10 rounded-2xl text-xs"
                  showName={false}
                />
                <div className="min-w-0 flex-1">
                  <ProfileIdentityLink
                    uid={active.participant.uid}
                    displayName={active.participant.displayName}
                    photoURL={active.participant.photoURL}
                    showAvatar={false}
                    className="text-sm"
                  />
                  <p className="text-muted-foreground truncate text-xs">
                    {active.participant.gradeLevel}
                    {active.participant.school
                      ? ` · ${active.participant.school}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={
                    active.blockedByViewer
                      ? "Unblock educator"
                      : "Block educator"
                  }
                  title={
                    active.blockedByViewer
                      ? "Unblock educator"
                      : "Block educator"
                  }
                  onClick={() => void toggleBlock()}
                  className={cn(
                    "hover:bg-muted grid size-11 place-items-center rounded-xl transition-colors",
                    active.blockedByViewer
                      ? "text-destructive bg-destructive/8"
                      : "text-muted-foreground",
                  )}
                >
                  <Ban aria-hidden="true" className="size-4" />
                </button>
              </header>

              <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
                {messagePage.nextCursor && (
                  <button
                    type="button"
                    disabled={loadingHistory}
                    onClick={() => void loadOlder()}
                    className="surface-inset text-muted-foreground hover:text-foreground mx-auto mb-5 block min-h-11 px-4 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {loadingHistory ? "Loading..." : "Load older messages"}
                  </button>
                )}
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                  {messagePage.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      mine={message.senderId === viewer.uid}
                      participant={active.participant}
                      onEdit={() => void editMessage(message)}
                      onDelete={() => removeMessage(message)}
                    />
                  ))}
                  <div ref={messageEnd} />
                </div>
              </div>

              <footer className="border-border/70 bg-card/80 relative z-10 shrink-0 border-t p-3 backdrop-blur-md sm:p-4">
                {active.blockedByViewer || active.blockedViewer ? (
                  <div className="surface-inset mx-auto max-w-3xl px-4 py-3 text-center">
                    <p className="text-muted-foreground text-sm">
                      Messaging is unavailable for this conversation.
                    </p>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl">
                    {attachment && (
                      <div className="surface-inset mb-2 flex items-center gap-2 px-3 py-2 text-xs">
                        <FileText
                          aria-hidden="true"
                          className="text-primary size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {attachment.name}
                        </span>
                        <button
                          type="button"
                          aria-label="Remove attachment"
                          onClick={() => setAttachment(null)}
                          className="hover:bg-card grid size-11 shrink-0 place-items-center rounded-xl"
                        >
                          <X aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    )}
                    <div className="surface-inset flex items-end gap-1.5 p-1.5 sm:gap-2 sm:p-2">
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(event) =>
                          setAttachment(event.target.files?.[0] ?? null)
                        }
                      />
                      <button
                        type="button"
                        aria-label="Attach file"
                        title="Attach file"
                        onClick={() => fileInput.current?.click()}
                        className="text-muted-foreground hover:bg-card hover:text-foreground grid size-11 shrink-0 place-items-center rounded-xl transition-colors"
                      >
                        <Paperclip aria-hidden="true" className="size-4" />
                      </button>
                      <textarea
                        ref={textarea}
                        aria-label="Message"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        rows={1}
                        maxLength={5_000}
                        placeholder="Write a message..."
                        className="placeholder:text-muted-foreground/80 max-h-28 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Send message"
                        disabled={pending || (!content.trim() && !attachment)}
                        onClick={() => void sendMessage()}
                        className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl shadow-sm transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
                      >
                        {pending ? (
                          <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <Send aria-hidden="true" className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </footer>
            </>
          ) : (
            <div className="relative z-10 flex flex-1 items-center justify-center p-8 text-center">
              <div className="max-w-sm">
                <span className="icon-well mx-auto size-16 rounded-2xl">
                  <Send aria-hidden="true" className="size-7" />
                </span>
                <h2 className="mt-5 font-serif text-2xl tracking-tight">
                  Your messages
                </h2>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  Select a conversation or start one with another educator in
                  your professional network.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  participant,
  onEdit,
  onDelete,
}: {
  message: DirectMessage;
  mine: boolean;
  participant: ConversationSummary["participant"];
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
      {!mine && (
        <ProfileIdentityLink
          uid={participant.uid}
          displayName={participant.displayName}
          photoURL={participant.photoURL}
          avatarClassName="size-8 rounded-xl text-[9px]"
          className="mb-5"
          showName={false}
        />
      )}
      <div
        className={cn(
          "flex max-w-[min(100%,28rem)] flex-col gap-1",
          mine ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-xs",
            mine
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "surface-card rounded-bl-md",
            message.deletedAt && "opacity-70",
          )}
        >
          {message.content && (
            <p className="wrap-anywhere whitespace-pre-wrap">
              {message.content}
            </p>
          )}
          {message.attachment && (
            <a
              href={`/api/messages/${message.conversationId}/attachments/${message.attachment.id}`}
              className={cn(
                "mt-2 flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold underline-offset-2 hover:underline",
                mine
                  ? "text-primary-foreground bg-white/12"
                  : "bg-primary/8 text-primary",
              )}
            >
              <Download aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{message.attachment.fileName}</span>
            </a>
          )}
        </div>
        <span
          className={cn(
            "text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[10px]",
            mine && "flex-row-reverse",
          )}
        >
          <span>
            {formatDistanceToNow(new Date(message.createdAt), {
              addSuffix: true,
            })}
            {message.deletedAt
              ? ` · deleted ${formatDistanceToNow(new Date(message.deletedAt), { addSuffix: true })}`
              : message.editedAt
                ? ` · edited ${formatDistanceToNow(new Date(message.editedAt), { addSuffix: true })}`
                : ""}
          </span>
          {mine && !message.deletedAt && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="hover:text-foreground min-h-11 px-1 font-semibold"
              >
                Edit
              </button>
              <DeleteConfirmDialog itemName="message" onConfirm={onDelete}>
                <button
                  type="button"
                  className="text-destructive hover:text-destructive/80 min-h-11 px-1 font-semibold"
                >
                  Delete
                </button>
              </DeleteConfirmDialog>
            </span>
          )}
          {!mine && <ReportMessageDialog message={message} />}
        </span>
      </div>
    </div>
  );
}
