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
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
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
}: {
  categories: ForumCategory[];
  initialPage: ForumPage;
}) {
  const [view, setView] = useState<"categories" | "threads">("categories");
  const [selectedCategory, setSelectedCategory] =
    useState<ForumCategory | null>(null);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadThreads(category: ForumCategory | null) {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("categoryId", category.id);
    const response = await fetch(`/api/forum?${params}`);
    const result = (await response
      .json()
      .catch(() => null)) as ForumPage | null;
    setLoading(false);
    if (!response.ok || !result)
      return toast.error("We couldn't load forum discussions.");
    setSelectedCategory(category);
    setPage(result);
    setView("threads");
  }

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
          open={creating}
          onOpenChange={setCreating}
        />
      </header>

      <div className="bg-card mb-5 flex w-fit rounded-xl border p-1">
        <ViewButton
          label="Categories"
          icon={LayoutGrid}
          active={view === "categories"}
          onClick={() => {
            setView("categories");
            setSelectedCategory(null);
          }}
        />
        <ViewButton
          label="All Threads"
          icon={TrendingUp}
          active={view === "threads" && !selectedCategory}
          onClick={() => void loadThreads(null)}
        />
      </div>

      {view === "categories" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onClick={() => void loadThreads(category)}
            />
          ))}
        </div>
      ) : (
        <section>
          {selectedCategory && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setView("categories")}
                className="text-muted-foreground hover:text-foreground"
              >
                Categories
              </button>
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
            <div className="bg-card rounded-xl border py-16 text-center">
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

function CategoryCard({
  category,
  onClick,
}: {
  category: ForumCategory;
  onClick: () => void;
}) {
  const Icon = categoryIcons[category.icon] ?? MessageSquare;
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card group w-full rounded-xl border p-5 text-left hover:shadow-sm"
    >
      <div className="flex items-start gap-4">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-lg"
          style={{
            backgroundColor: `${category.color}18`,
            color: category.color,
          }}
        >
          <Icon aria-hidden="true" className="size-5" />
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
          className="text-muted-foreground group-hover:text-primary size-4 shrink-0"
        />
      </div>
    </button>
  );
}

function ThreadRow({ thread }: { thread: ForumThreadSummary }) {
  return (
    <Link
      href={`/forum/${thread.id}`}
      className="bg-card group block rounded-xl border p-4 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          name={thread.author.displayName}
          photoURL={thread.author.photoURL}
          className="size-9 rounded-full text-[10px]"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {thread.pinned && <StatusBadge icon={Pin} label="Pinned" />}
            {thread.solved && (
              <StatusBadge icon={CheckCircle2} label="Solved" success />
            )}
            <h2 className="group-hover:text-primary min-w-0 flex-1 truncate text-sm font-bold">
              {thread.title}
            </h2>
          </div>
          <p className="text-foreground/65 line-clamp-2 text-xs leading-5">
            {thread.content}
          </p>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span>{thread.author.displayName}</span>
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
    </Link>
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
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function NewThreadDialog({
  categories,
  open,
  onOpenChange,
}: {
  categories: ForumCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    categoryId: categories[0]?.id ?? "",
    title: "",
    content: "",
    tags: "",
  });

  async function submit() {
    setSubmitting(true);
    const response = await fetch("/api/forum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
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
    setSubmitting(false);
    if (!response.ok || !result?.threadId)
      return toast.error(result?.error ?? "We couldn't post this discussion.");
    location.assign(`/forum/${result.threadId}`);
  }

  const valid =
    form.categoryId &&
    form.title.trim().length >= 8 &&
    form.content.trim().length >= 20;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <Dialog.Trigger
        aria-label="Start a new discussion"
        className="bg-primary text-primary-foreground flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold"
      >
        <PlusCircle aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">New Thread</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-2xl sm:p-6">
          <Dialog.Title className="font-serif text-2xl">
            Start a Discussion
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Create a forum discussion.
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close discussion form"
            className="text-muted-foreground hover:bg-muted absolute top-2.5 right-2.5 grid size-11 place-items-center rounded-lg"
          >
            <X aria-hidden="true" className="size-4" />
          </Dialog.Close>
          <div className="mt-5 space-y-4">
            <Field label="Category">
              <select
                value={form.categoryId}
                onChange={(event) =>
                  setForm({ ...form, categoryId: event.target.value })
                }
                className="resource-input"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                maxLength={180}
                placeholder="Give your discussion a clear title..."
                className="resource-input"
              />
            </Field>
            <Field label="Your post">
              <textarea
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                maxLength={10_000}
                rows={6}
                placeholder="Share your question, experience, or discussion prompt..."
                className="resource-input resize-none"
              />
            </Field>
            <Field label="Tags">
              <input
                value={form.tags}
                onChange={(event) =>
                  setForm({ ...form, tags: event.target.value })
                }
                maxLength={180}
                placeholder="discussion, student voice"
                className="resource-input"
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="hover:bg-muted h-10 rounded-lg px-4 text-sm font-semibold">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={!valid || submitting}
              onClick={() => void submit()}
              className="bg-primary text-primary-foreground h-10 rounded-lg px-5 text-sm font-bold disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post Discussion"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold">
      <span className="text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
