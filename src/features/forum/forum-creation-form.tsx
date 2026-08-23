"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MentionTextarea } from "@/features/mentions/mention-textarea";
import {
  deleteCreationDraft,
  saveCreationDraft,
} from "@/lib/creation-drafts/client";
import type { ForumCategory } from "@/lib/forum/server";
import type { MentionTarget } from "@/lib/mentions/types";
import type { ForumCreationDraft } from "@/schemas/creation-draft";

export function ForumCreationForm({
  categories,
  initialCategoryId,
  draft,
}: {
  categories: ForumCategory[];
  initialCategoryId: string;
  draft: ForumCreationDraft | null;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [form, setForm] = useState({
    categoryId: draft?.categoryId || initialCategoryId,
    title: draft?.title ?? "",
    content: draft?.content ?? "",
    tags: draft?.tags ?? "",
  });
  const [mentions, setMentions] = useState<MentionTarget[]>(
    draft?.mentions ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveDraft() {
    setSaving(true);
    try {
      await saveCreationDraft("forum", { ...form, mentions });
      toast.success("Discussion saved as a draft.");
      router.push("/forum");
      router.refresh();
    } catch {
      toast.error("We couldn't save this draft.");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.categoryId) nextErrors.categoryId = "Choose a forum category.";
    if (form.title.trim().length < 8)
      nextErrors.title = "Use at least 8 characters for the title.";
    if (form.content.trim().length < 20)
      nextErrors.content = "Use at least 20 characters for your post.";
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      requestAnimationFrame(() => {
        if (first === "categoryId") categoryRef.current?.focus();
        if (first === "title") titleRef.current?.focus();
        if (first === "content") contentRef.current?.focus();
      });
      return;
    }

    setServerError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          mentionUids: mentions.map((mention) => mention.uid),
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 5),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        threadId?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.threadId) {
        const message = result?.error ?? "We couldn't post this discussion.";
        setServerError(message);
        toast.error(message);
        return;
      }
      await deleteCreationDraft("forum").catch(() => undefined);
      router.push(`/forum/${result.threadId}`);
      router.refresh();
    } catch {
      const message =
        "We couldn't reach the forum. Check your connection and try again.";
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || saving;

  return (
    <form
      className="surface-card space-y-5 p-5 sm:p-6"
      onSubmit={submit}
      noValidate
    >
      {draft && (
        <p className="bg-accent/10 text-accent-readable rounded-lg px-3 py-2 text-sm font-semibold">
          Your saved draft has been restored.
        </p>
      )}
      <FormField
        id="thread-category"
        label="Category"
        required
        error={errors.categoryId}
      >
        {({ describedBy, invalid }) => (
          <Select
            ref={categoryRef}
            id="thread-category"
            value={form.categoryId}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(event) => {
              setForm({ ...form, categoryId: event.target.value });
              setErrors((current) => ({ ...current, categoryId: "" }));
            }}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField
        id="thread-title"
        label="Title"
        required
        hint="At least 8 characters."
        error={errors.title}
      >
        {({ describedBy, invalid }) => (
          <Input
            ref={titleRef}
            id="thread-title"
            value={form.title}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            maxLength={180}
            placeholder="Give your discussion a clear title..."
            onChange={(event) => {
              setForm({ ...form, title: event.target.value });
              setErrors((current) => ({ ...current, title: "" }));
            }}
          />
        )}
      </FormField>
      <FormField
        id="thread-content"
        label="Your post"
        required
        hint="At least 20 characters."
        error={errors.content}
      >
        {({ describedBy, invalid }) => (
          <MentionTextarea
            ref={contentRef}
            id="thread-content"
            value={form.content}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            maxLength={10_000}
            rows={9}
            placeholder="Share your question, experience, or discussion prompt..."
            className="resize-y"
            mentions={mentions}
            onMentionsChange={setMentions}
            onValueChange={(value) => {
              setForm({ ...form, content: value });
              setErrors((current) => ({ ...current, content: "" }));
            }}
          />
        )}
      </FormField>
      <FormField
        id="thread-tags"
        label="Tags"
        hint="Optional. Separate up to five tags with commas."
      >
        {({ describedBy }) => (
          <Input
            id="thread-tags"
            value={form.tags}
            aria-describedby={describedBy}
            maxLength={180}
            placeholder="discussion, student voice"
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
          />
        )}
      </FormField>
      {serverError && (
        <p className="text-destructive text-sm" role="alert">
          {serverError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
        <Button asChild type="button" variant="ghost">
          <Link href="/forum">Cancel</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void saveDraft()}
        >
          {saving ? "Saving..." : "Save as draft"}
        </Button>
        <Button type="submit" disabled={busy}>
          {submitting ? "Posting discussion..." : "Post discussion"}
        </Button>
      </div>
    </form>
  );
}
