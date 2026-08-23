"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  deleteCreationDraft,
  saveCreationDraft,
} from "@/lib/creation-drafts/client";
import type { MessageCreationDraft } from "@/schemas/creation-draft";
import type { ProfileSearchResult } from "@/types/models";

export function NewConversationForm({
  viewerUid,
  initialRecipientUid,
  draft,
}: {
  viewerUid: string;
  initialRecipientUid: string | null;
  draft: MessageCreationDraft | null;
}) {
  const [search, setSearch] = useState("");
  const [educators, setEducators] = useState<ProfileSearchResult[]>([]);
  const [recipient, setRecipient] = useState<ProfileSearchResult | null>(
    initialRecipientUid ? null : (draft?.recipient ?? null),
  );
  const [content, setContent] = useState(draft?.content ?? "");
  const [recipientLoaded, setRecipientLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search.trim().length < 2) {
      setEducators([]);
      return;
    }
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
    if (!initialRecipientUid || recipientLoaded || recipient) return;
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
        if (
          response.ok &&
          result?.educator &&
          result.educator.uid !== viewerUid
        )
          setRecipient(result.educator);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          toast.error("We couldn't load that educator.");
      } finally {
        if (!controller.signal.aborted) setRecipientLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [initialRecipientUid, recipient, recipientLoaded, viewerUid]);

  async function saveDraft() {
    setSaving(true);
    try {
      await saveCreationDraft("message", { recipient, content });
      toast.success("Message saved as a draft.");
      window.location.assign("/messages");
    } catch {
      toast.error("We couldn't save this draft.");
      setSaving(false);
    }
  }

  async function startConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipient || !content.trim() || submitting) return;
    setSubmitting(true);
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: recipient.uid, content }),
    });
    const result = (await response.json().catch(() => null)) as {
      conversationId?: string;
      error?: string;
    } | null;
    if (!response.ok || !result?.conversationId) {
      toast.error(result?.error ?? "We couldn't start this conversation.");
      setSubmitting(false);
      return;
    }
    await deleteCreationDraft("message").catch(() => undefined);
    window.location.assign(`/messages?conversation=${result.conversationId}`);
  }

  const visibleEducators = search.trim().length >= 2 ? educators : [];
  const busy = submitting || saving;

  return (
    <form
      className="surface-card space-y-5 p-5 sm:p-6"
      onSubmit={startConversation}
    >
      {draft && (
        <p className="bg-accent/10 text-accent-readable rounded-lg px-3 py-2 text-sm font-semibold">
          Your saved draft has been restored.
        </p>
      )}
      <div>
        <label
          htmlFor="educator-search"
          className="mb-2 block text-sm font-bold"
        >
          To
        </label>
        {recipient ? (
          <button
            type="button"
            onClick={() => setRecipient(null)}
            className="bg-muted hover:bg-muted/70 flex w-full items-center gap-3 rounded-xl p-3 text-left"
          >
            <UserAvatar
              name={recipient.displayName}
              photoURL={recipient.photoURL}
              className="size-10 rounded-full text-xs"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">
                {recipient.displayName}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {recipient.gradeLevel} · {recipient.school}
              </span>
            </span>
            <span className="text-primary text-xs font-bold">Change</span>
          </button>
        ) : (
          <>
            <input
              id="educator-search"
              type="search"
              name="educator-search"
              autoComplete="off"
              inputMode="search"
              enterKeyHint="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search educators..."
              className="input-shell bg-background h-11 w-full rounded-xl border px-3 text-sm"
            />
            <div className="mt-2 max-h-64 overflow-y-auto">
              {visibleEducators.map((educator) => (
                <button
                  key={educator.uid}
                  type="button"
                  onClick={() => {
                    setRecipient(educator);
                    setSearch("");
                  }}
                  className="hover:bg-muted flex w-full items-center gap-3 rounded-lg p-3 text-left"
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
              {search.trim().length >= 2 && visibleEducators.length === 0 && (
                <p className="text-muted-foreground px-2 py-4 text-sm">
                  No educators found.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <div>
        <label htmlFor="new-message" className="mb-2 block text-sm font-bold">
          Message
        </label>
        <textarea
          id="new-message"
          name="new-message"
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck
          inputMode="text"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={5_000}
          rows={9}
          placeholder="Write your message..."
          className="bg-background w-full resize-y rounded-xl border px-3 py-3 text-base md:text-sm"
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
        <Button asChild type="button" variant="ghost">
          <Link href="/messages">Cancel</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void saveDraft()}
        >
          {saving ? "Saving..." : "Save as draft"}
        </Button>
        <Button type="submit" disabled={busy || !recipient || !content.trim()}>
          {submitting ? "Sending..." : "Send message"}
        </Button>
      </div>
    </form>
  );
}
