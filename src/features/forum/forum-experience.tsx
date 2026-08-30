"use client";

import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  Heart,
  HelpCircle,
  LayoutGrid,
  Lightbulb,
  ListTree,
  MessageCircle,
  MessageSquare,
  Monitor,
  Pin,
  PlusCircle,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
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
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [searchPage, setSearchPage] = useState<{
    query: string;
    page: ForumPage;
  } | null>(null);
  const contentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (deferredQuery.length < 2) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ query: deferredQuery });
    if (selectedCategory) params.set("categoryId", selectedCategory.id);
    void fetch(`/api/forum?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Search failed");
        return (await response.json()) as ForumPage;
      })
      .then((page) => setSearchPage({ query: deferredQuery, page }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setSearchPage({
            query: deferredQuery,
            page: { threads: [], nextCursor: null },
          });
          toast.error("We couldn't search the forum.");
        }
      });

    return () => controller.abort();
  }, [deferredQuery, selectedCategory]);

  useEffect(() => {
    if (!showThreads) return;
    contentHeadingRef.current?.focus({ preventScroll: true });
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

  const searchingForum = deferredQuery.length >= 2;
  const searchMatchesRequest =
    searchingForum && searchPage?.query === deferredQuery;
  const searching = searchingForum && !searchMatchesRequest;
  const visiblePage = searchingForum
    ? searchMatchesRequest
      ? searchPage.page
      : { threads: [], nextCursor: null }
    : page;
  const showingThreads = showThreads || searchingForum;

  return (
    <div className="mx-auto max-w-6xl [overflow-anchor:none]">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Forum</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Discuss, question, and grow with your professional learning
            community.
          </p>
        </div>
        <Link
          href={`/forum/new${selectedCategory ? `?category=${encodeURIComponent(selectedCategory.id)}` : ""}`}
          aria-label="Start a new discussion"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold"
        >
          <PlusCircle aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">New Thread</span>
        </Link>
      </header>

      <label className="surface-card input-shell relative mb-5 block max-w-2xl overflow-hidden">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <span className="sr-only">Search forum discussions</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search discussions, questions, and tags..."
          className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:outline-none"
        />
      </label>

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

      {!showingThreads ? (
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
            {searchingForum
              ? "Search results"
              : (selectedCategory?.name ?? "All discussions")}
          </h2>
          {searchingForum && (
            <p
              className="text-muted-foreground mb-4 text-sm"
              aria-live="polite"
            >
              {searching
                ? `Searching for “${deferredQuery}”…`
                : `${visiblePage.threads.length} results for “${deferredQuery}”`}
            </p>
          )}
          {selectedCategory && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <Link
                href="/forum"
                scroll={false}
                className="text-muted-foreground hover:text-foreground"
              >
                Categories
              </Link>
              <ChevronRight aria-hidden="true" className="size-4" />
              <span className="font-semibold">{selectedCategory.name}</span>
            </div>
          )}
          {(searching || loading) && !visiblePage.threads.length ? (
            <div className="text-muted-foreground py-16 text-center text-sm">
              Loading discussions...
            </div>
          ) : visiblePage.threads.length ? (
            <div className="space-y-2">
              {visiblePage.threads.map((thread) => (
                <ThreadRow key={thread.id} thread={thread} />
              ))}
            </div>
          ) : (
            <div className="surface-card py-16 text-center">
              <MessageSquare
                aria-hidden="true"
                className="text-muted-foreground/30 mx-auto size-8"
              />
              <h2 className="mt-3 font-serif text-xl">
                {searchingForum ? "No matching discussions" : "No threads yet"}
              </h2>
              {searchingForum ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="border-primary text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
                >
                  Clear search
                </button>
              ) : (
                <Link
                  href={`/forum/new${selectedCategory ? `?category=${encodeURIComponent(selectedCategory.id)}` : ""}`}
                  className="bg-primary text-primary-foreground mt-4 rounded-lg px-4 py-2 text-sm font-bold"
                >
                  Start a Thread
                </Link>
              )}
            </div>
          )}
          {!searchingForum && page.nextCursor && (
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
      scroll={false}
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
              <ListTree aria-hidden="true" className="size-3" />
              {category.threadCount.toLocaleString()}{" "}
              {category.threadCount === 1 ? "thread" : "threads"}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle aria-hidden="true" className="size-3" />
              {category.commentCount.toLocaleString()}{" "}
              {category.commentCount === 1 ? "comment" : "comments"}
            </span>
          </span>
          <span className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
            <Clock3 aria-hidden="true" className="size-3" />
            {category.lastActivityAt
              ? `Last activity ${formatDistanceToNow(new Date(category.lastActivityAt), { addSuffix: true })}`
              : "No activity yet"}
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
              {thread.replyCount}{" "}
              {thread.replyCount === 1 ? "comment" : "comments"}
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
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
