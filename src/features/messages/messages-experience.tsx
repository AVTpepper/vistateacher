"use client";

import {
  ArrowLeft,
  Ban,
  Download,
  FileText,
  Loader2,
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
import { NewConversationDialog } from "@/features/messages/new-conversation-dialog";
import { ReportMessageDialog } from "@/features/messages/report-message-dialog";
import { getFirebaseClient } from "@/lib/firebase/client";
import type {
  ConversationSummary,
  DirectMessage,
  MessagePage,
} from "@/lib/messages/server";

export function MessagesExperience({
  viewer,
  initialConversations,
  initialConversationId,
  initialMessages,
}: {
  viewer: { uid: string; displayName: string; photoURL: string | null };
  initialConversations: ConversationSummary[];
  initialConversationId: string | null;
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
    messageEnd.current?.scrollIntoView({ behavior: "smooth" });
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

  const filtered = conversations.filter((item) =>
    item.participant.displayName.toLowerCase().includes(search.toLowerCase()),
  );
  const unread = conversations.reduce(
    (total, item) => total + item.unreadCount,
    0,
  );

  return (
    <div className="bg-background flex h-full min-h-0 overflow-hidden border-t">
      <section
        className={`${mobileChat ? "hidden" : "flex"} bg-card w-full shrink-0 flex-col border-r lg:flex lg:w-80`}
      >
        <div className="border-b p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="font-serif text-xl">Messages</h1>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-bold">
                  {unread}
                </span>
              )}
              <NewConversationDialog viewerUid={viewer.uid} />
            </div>
          </div>
          <label className="bg-muted flex items-center gap-2 rounded-lg px-3 py-2">
            <Search
              aria-hidden="true"
              className="text-muted-foreground size-4"
            />
            <span className="sr-only">Search messages</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search messages..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length ? (
            filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void selectConversation(conversation)}
                className={`hover:bg-muted/60 flex w-full items-center gap-3 border-b p-4 text-left ${activeId === conversation.id ? "bg-secondary/30" : ""}`}
              >
                <UserAvatar
                  name={conversation.participant.displayName}
                  photoURL={conversation.participant.photoURL}
                  className="size-11 shrink-0 rounded-full text-xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {conversation.participant.displayName}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[10px]">
                      {formatDistanceToNow(
                        new Date(conversation.lastMessageAt),
                        { addSuffix: true },
                      )}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                    {conversation.lastMessagePreview}
                  </span>
                </span>
                {conversation.unreadCount > 0 && (
                  <span className="bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                    {conversation.unreadCount}
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-6 py-12 text-center text-sm">
              {search
                ? "No matching conversations."
                : "Start a conversation with an educator."}
            </p>
          )}
        </div>
      </section>

      <section
        className={`${mobileChat ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}
      >
        {active ? (
          <>
            <header className="bg-card flex h-16 shrink-0 items-center gap-3 border-b px-4">
              <button
                type="button"
                aria-label="Back to conversations"
                onClick={() => setMobileChat(false)}
                className="text-muted-foreground hover:bg-muted grid size-9 place-items-center rounded-lg lg:hidden"
              >
                <ArrowLeft aria-hidden="true" className="size-5" />
              </button>
              <UserAvatar
                name={active.participant.displayName}
                photoURL={active.participant.photoURL}
                className="size-9 rounded-full text-xs"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {active.participant.displayName}
                </p>
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
                  active.blockedByViewer ? "Unblock educator" : "Block educator"
                }
                title={
                  active.blockedByViewer ? "Unblock educator" : "Block educator"
                }
                onClick={() => void toggleBlock()}
                className={`hover:bg-muted grid size-9 place-items-center rounded-lg ${active.blockedByViewer ? "text-destructive" : "text-muted-foreground"}`}
              >
                <Ban aria-hidden="true" className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {messagePage.nextCursor && (
                <button
                  type="button"
                  disabled={loadingHistory}
                  onClick={() => void loadOlder()}
                  className="text-muted-foreground hover:text-foreground mx-auto mb-5 block text-xs font-bold"
                >
                  {loadingHistory ? "Loading..." : "Load older messages"}
                </button>
              )}
              <div className="mx-auto max-w-3xl space-y-3">
                {messagePage.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    mine={message.senderId === viewer.uid}
                    participant={active.participant}
                  />
                ))}
                <div ref={messageEnd} />
              </div>
            </div>
            <footer className="bg-card shrink-0 border-t p-3 sm:p-4">
              {active.blockedByViewer || active.blockedViewer ? (
                <p className="text-muted-foreground text-center text-sm">
                  Messaging is unavailable for this conversation.
                </p>
              ) : (
                <div className="mx-auto max-w-3xl">
                  {attachment && (
                    <div className="bg-muted mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
                      <FileText aria-hidden="true" className="size-4" />
                      <span className="min-w-0 flex-1 truncate">
                        {attachment.name}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove attachment"
                        onClick={() => setAttachment(null)}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  )}
                  <div className="bg-muted flex items-end gap-2 rounded-xl p-2">
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
                      className="text-muted-foreground hover:bg-card grid size-9 shrink-0 place-items-center rounded-lg"
                    >
                      <Paperclip aria-hidden="true" className="size-4" />
                    </button>
                    <textarea
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
                      className="max-h-28 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Send message"
                      disabled={pending || (!content.trim() && !attachment)}
                      onClick={() => void sendMessage()}
                      className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg disabled:opacity-40"
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
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <span className="bg-muted text-muted-foreground mx-auto grid size-16 place-items-center rounded-xl">
                <Send aria-hidden="true" className="size-7" />
              </span>
              <h2 className="mt-4 font-serif text-xl">Your messages</h2>
              <p className="text-muted-foreground mt-1 max-w-xs text-sm">
                Select a conversation or start one with another educator.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  participant,
}: {
  message: DirectMessage;
  mine: boolean;
  participant: ConversationSummary["participant"];
}) {
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && (
        <UserAvatar
          name={participant.displayName}
          photoURL={participant.photoURL}
          className="size-7 shrink-0 rounded-full text-[9px]"
        />
      )}
      <div
        className={`flex max-w-[82%] flex-col gap-1 sm:max-w-md ${mine ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm leading-6 ${
            mine
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card rounded-bl-sm border"
          }`}
        >
          {message.content && (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
          {message.attachment && (
            <a
              href={`/api/messages/${message.conversationId}/attachments/${message.attachment.id}`}
              className={`mt-1 flex items-center gap-2 font-bold underline-offset-2 hover:underline ${mine ? "text-primary-foreground" : "text-primary"}`}
            >
              <Download aria-hidden="true" className="size-4" />
              <span className="truncate">{message.attachment.fileName}</span>
            </a>
          )}
        </div>
        <span className="text-muted-foreground flex items-center gap-2 px-1 text-[10px]">
          {formatDistanceToNow(new Date(message.createdAt), {
            addSuffix: true,
          })}
          {!mine && <ReportMessageDialog message={message} />}
        </span>
      </div>
    </div>
  );
}
