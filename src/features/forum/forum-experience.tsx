"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Hash,
  Heart,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  MessageCircle,
  MessageSquare,
  Monitor,
  Pin,
  PlusCircle,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormDialogContent } from "@/components/ui/form-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
import { Select } from "@/components/ui/select";
import { MentionTextarea } from "@/features/mentions/mention-textarea";
import type { MentionTarget } from "@/lib/mentions/types";
import type {
  ForumCategory,
  ForumPage,
  ForumThreadSummary,
} from "@/lib/forum/server";

const categoryIcons: Record<string, LucideIcon> = {
  Layout: LayoutGrid,
  LayoutGrid,
  BookOpen,
  Zap,
  Monitor,
  Heart,
  Users,
  MessageCircle,
  HelpCircle,
  Sparkles,
  Lightbulb,
};

export function ForumExperience({
  categories,
  initialPage,
  selectedCategory,
  showThreads,
}: {
  categories: ForumCategory[];
  initialPage: ForumPage;
  selectedCategory: ForumCategory | null;
  showThreads: boolean;
}) {
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const contentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!showThreads) return;
    contentHeadingRef.current?.focus({ preventScroll: true });
    contentHeadingRef.current?.scrollIntoView({
      behavior: "instant",
      block: "start",
    });
  }, [selectedCategory?.id, showThreads]);

  async function loadMore() {
    if (!page.nextCursor || loading) return;
    setLoading(true);
    const params = new URLSearchParams({ cursor: page.nextCursor });
    if (selectedCategory) params.set("categoryId", selectedCategory.id);
    const response = await fetch(`/api/forum?${params}`);
    const result = (await response
      .json()
      .catch(() => null)) as ForumPage | null;
    setLoading(false);
    if (!response.ok || !result)
      return toast.error("We couldn't load more discussions.");
    setPage({
      threads: [...page.threads, ...result.threads],
      nextCursor: result.nextCursor,
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Forum</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Discuss, question, and grow with your professional learning
            community.
          </p>
        </div>
        <NewThreadDialog
          categories={categories}
          selectedCategory={selectedCategory}
          open={creating}
          onOpenChange={setCreating}
        />
      </header>

      <div className="surface-card mb-5 flex w-fit p-1">
        <ViewButton
          label="Categories"
          icon={LayoutGrid}
          active={!showThreads}
          href="/forum"
        />
        <ViewButton
          label="All Threads"
          icon={TrendingUp}
          active={showThreads && !selectedCategory}
          href="/forum?category=all"
        />
      </div>

      {!showThreads ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      ) : (
        <section aria-labelledby="forum-content-heading">
          <h2
            ref={contentHeadingRef}
            id="forum-content-heading"
            tabIndex={-1}
            className="mb-4 font-serif text-2xl outline-none"
          >
            {selectedCategory?.name ?? "All discussions"}
          </h2>
          {selectedCategory && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <Link
                href="/forum"
                className="text-muted-foreground hover:text-foreground"
              >
                Categories
              </Link>
              <ChevronRight aria-hidden="true" className="size-4" />
              <span className="font-semibold">{selectedCategory.name}</span>
            </div>
          )}
          {loading && !page.threads.length ? (
            <div className="text-muted-foreground py-16 text-center text-sm">
              Loading discussions...
            </div>
          ) : page.threads.length ? (
            <div className="space-y-2">
              {page.threads.map((thread) => (
                <ThreadRow key={thread.id} thread={thread} />
              ))}
            </div>
          ) : (
            <div className="surface-card py-16 text-center">
              <MessageSquare
                aria-hidden="true"
                className="text-muted-foreground/30 mx-auto size-8"
              />
              <h2 className="mt-3 font-serif text-xl">No threads yet</h2>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="bg-primary text-primary-foreground mt-4 rounded-lg px-4 py-2 text-sm font-bold"
              >
                Start a Thread
              </button>
            </div>
          )}
          {page.nextCursor && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMore()}
              className="bg-card hover:bg-muted mx-auto mt-5 block rounded-lg border px-5 py-2 text-sm font-bold disabled:opacity-50"
            >
              {loading ? "Loading..." : "Load more"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function CategoryCard({ category }: { category: ForumCategory }) {
  const Icon = categoryIcons[category.icon] ?? MessageSquare;
  return (
    <Link
      href={`/forum?category=${encodeURIComponent(category.id)}`}
      className="surface-card surface-card-interactive group w-full p-5 text-left"
    >
      <div className="flex items-start gap-4">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-lg"
          style={{
            backgroundColor: `${category.color}18`,
            color: category.color,
          }}
        >
          <Icon
            aria-hidden="true"
            className="size-5 transition-transform duration-200 group-hover:scale-110"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="group-hover:text-primary block text-sm font-bold">
            {category.name}
          </span>
          <span className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
            {category.description}
          </span>
          <span className="text-muted-foreground mt-3 flex gap-4 text-xs">
            <span className="flex items-center gap-1">
              <MessageSquare aria-hidden="true" className="size-3" />
              {category.threadCount.toLocaleString()} threads
            </span>
            <span className="flex items-center gap-1">
              <Hash aria-hidden="true" className="size-3" />
              {category.postCount.toLocaleString()} posts
            </span>
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground group-hover:text-accent-readable size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function ThreadRow({ thread }: { thread: ForumThreadSummary }) {
  return (
    <article className="surface-card surface-card-interactive group p-4">
      <div className="flex items-start gap-3">
        <ProfileIdentityLink
          uid={thread.author.uid}
          displayName={thread.author.displayName}
          photoURL={thread.author.photoURL}
          avatarClassName="size-9 rounded-full text-[10px]"
          showName={false}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {thread.pinned && <StatusBadge icon={Pin} label="Pinned" />}
            {thread.solved && (
              <StatusBadge icon={CheckCircle2} label="Solved" success />
            )}
            <Link
              href={`/forum/${thread.id}`}
              className="group-hover:text-primary min-w-0 flex-1 truncate text-sm font-bold"
            >
              {thread.title}
            </Link>
          </div>
          <p className="text-foreground/65 line-clamp-2 text-xs leading-5">
            {thread.content}
          </p>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
            <ProfileIdentityLink
              uid={thread.author.uid}
              displayName={thread.author.displayName}
              photoURL={thread.author.photoURL}
              showName
              showAvatar={false}
              className="font-normal"
            />
            <span className="bg-muted rounded-full px-2 py-0.5">
              {thread.category.name}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare aria-hidden="true" className="size-3" />
              {thread.replyCount} replies
            </span>
            <span className="flex items-center gap-1">
              <Eye aria-hidden="true" className="size-3" />
              {thread.viewCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock3 aria-hidden="true" className="size-3" />
              {formatDistanceToNow(new Date(thread.lastActivityAt), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          <Heart aria-hidden="true" className="size-3.5" />
          {thread.likeCount}
        </span>
      </div>
    </article>
  );
}

function StatusBadge({
  icon: Icon,
  label,
  success = false,
}: {
  icon: LucideIcon;
  label: string;
  success?: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${success ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}
    >
      <Icon aria-hidden="true" className="size-2.5" />
      {label}
    </span>
  );
}

function ViewButton({
  label,
  icon: Icon,
  active,
  href,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}

function NewThreadDialog({
  categories,
  selectedCategory,
  open,
  onOpenChange,
}: {
  categories: ForumCategory[];
  selectedCategory: ForumCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <Dialog.Trigger asChild>
        <Button aria-label="Start a new discussion">
          <PlusCircle aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">New Thread</span>
        </Button>
      </Dialog.Trigger>
      {open && (
        <FormDialogContent
          title="Start a Discussion"
          description="Choose a category and add a clear title and discussion prompt."
          footer={
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={submitting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                form="new-thread-form"
                disabled={submitting}
              >
                {submitting ? "Posting discussion..." : "Post Discussion"}
              </Button>
            </div>
          }
        >
          <NewThreadForm
            categories={categories}
            initialCategoryId={selectedCategory?.id ?? categories[0]?.id ?? ""}
            onSubmittingChange={setSubmitting}
          />
        </FormDialogContent>
      )}
    </Dialog.Root>
  );
}

function NewThreadForm({
  categories,
  initialCategoryId,
  onSubmittingChange,
}: {
  categories: ForumCategory[];
  initialCategoryId: string;
  onSubmittingChange: (submitting: boolean) => void;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const [form, setForm] = useState({
    categoryId: initialCategoryId,
    title: "",
    content: "",
    tags: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mentions, setMentions] = useState<MentionTarget[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

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
    onSubmittingChange(true);
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
      router.push(`/forum/${result.threadId}`);
      router.refresh();
    } catch {
      const message =
        "We couldn't reach the forum. Check your connection and try again.";
      setServerError(message);
      toast.error(message);
    } finally {
      onSubmittingChange(false);
    }
  }

  return (
    <form
      id="new-thread-form"
      className="space-y-4"
      onSubmit={submit}
      noValidate
    >
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
            rows={6}
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
      <p className="sr-only" aria-live="polite">
        {serverError ?? ""}
      </p>
      {serverError && (
        <p className="text-destructive text-sm" role="alert">
          {serverError}
        </p>
      )}
    </form>
  );
}
