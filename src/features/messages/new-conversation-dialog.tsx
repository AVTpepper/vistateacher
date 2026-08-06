"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { ProfileSearchResult } from "@/types/models";

export function NewConversationDialog({
  viewerUid,
  initialRecipientUid = null,
}: {
  viewerUid: string;
  initialRecipientUid?: string | null;
}) {
  const [open, setOpen] = useState(Boolean(initialRecipientUid));
  const [search, setSearch] = useState("");
  const [educators, setEducators] = useState<ProfileSearchResult[]>([]);
  const [recipient, setRecipient] = useState<ProfileSearchResult | null>(null);
  const [content, setContent] = useState("");
  const [initialRecipientLoaded, setInitialRecipientLoaded] = useState(false);

  useEffect(() => {
    if (search.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(search)}`,
        { signal: controller.signal },
      );
      const result = (await response.json().catch(() => null)) as {
        educators?: ProfileSearchResult[];
      } | null;
      setEducators(
        (result?.educators ?? []).filter((item) => item.uid !== viewerUid),
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, viewerUid]);

  useEffect(() => {
    if (!initialRecipientUid || initialRecipientLoaded || recipient) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/profile/${initialRecipientUid}/summary`,
          { signal: controller.signal },
        );
        const result = (await response.json().catch(() => null)) as {
          educator?: ProfileSearchResult;
        } | null;
        if (!response.ok || !result?.educator) {
          setInitialRecipientLoaded(true);
          return;
        }
        if (result.educator.uid !== viewerUid) {
          setRecipient(result.educator);
        }
        setInitialRecipientLoaded(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setInitialRecipientLoaded(true);
        }
      }
    })();

    return () => controller.abort();
  }, [initialRecipientLoaded, initialRecipientUid, recipient, viewerUid]);

  const visibleEducators = search.trim().length >= 2 ? educators : [];

  async function startConversation() {
    if (!recipient || !content.trim()) return;
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: recipient.uid, content }),
    });
    const result = (await response.json().catch(() => null)) as {
      conversationId?: string;
      error?: string;
    } | null;
    if (!response.ok || !result?.conversationId)
      return toast.error(
        result?.error ?? "We couldn't start this conversation.",
      );
    setOpen(false);
    window.location.assign(`/messages?conversation=${result.conversationId}`);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="New conversation"
          title="New conversation"
          className="text-primary hover:bg-muted grid size-11 place-items-center rounded-lg"
        >
          <MessageSquarePlus aria-hidden="true" className="size-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-xl">
          <Dialog.Title className="font-serif text-xl">
            New conversation
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-sm">
            Find an educator and send the first message.
          </Dialog.Description>
          {!recipient ? (
            <>
              <input
                aria-label="Search educators"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search educators..."
                className="bg-background mt-4 w-full rounded-lg border px-3 py-2 text-sm"
              />
              <div className="mt-2 max-h-52 overflow-y-auto">
                {visibleEducators.map((educator) => (
                  <button
                    key={educator.uid}
                    type="button"
                    onClick={() => setRecipient(educator)}
                    className="hover:bg-muted flex w-full items-center gap-3 rounded-lg p-2 text-left"
                  >
                    <UserAvatar
                      name={educator.displayName}
                      photoURL={educator.photoURL}
                      className="size-9 rounded-full text-xs"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {educator.displayName}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {educator.gradeLevel} · {educator.school}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setRecipient(null)}
                className="bg-muted mt-4 flex w-full items-center gap-3 rounded-lg p-3 text-left"
              >
                <UserAvatar
                  name={recipient.displayName}
                  photoURL={recipient.photoURL}
                  className="size-9 rounded-full text-xs"
                />
                <span className="text-sm font-bold">
                  {recipient.displayName}
                </span>
              </button>
              <textarea
                aria-label="Message"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={5_000}
                rows={4}
                placeholder="Write your message..."
                className="bg-background mt-3 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border px-4 py-2 text-sm font-bold">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={!recipient || !content.trim()}
              onClick={() => void startConversation()}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40"
            >
              Send message
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
