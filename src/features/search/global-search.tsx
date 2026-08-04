"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, FileQuestion, LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { GroupedSearchResults } from "@/lib/search/server";

const emptyResults: GroupedSearchResults = {
  educators: [],
  resources: [],
  discussions: [],
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState(emptyResults);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || deferredQuery.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(deferredQuery)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Search failed");
        return (await response.json()) as GroupedSearchResults;
      })
      .then(setResults)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setResults(emptyResults);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [deferredQuery, open]);

  useEffect(() => {
    function openSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    setResults(emptyResults);
    setLoading(false);
    router.push(href);
  }

  function updateQuery(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults(emptyResults);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  const hasResults =
    results.educators.length +
      results.resources.length +
      results.discussions.length >
    0;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="bg-muted text-muted-foreground hover:text-foreground flex h-9 w-full max-w-xl items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Search teachers, resources...
          </span>
          <kbd className="border-border bg-card hidden rounded-md border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            Ctrl K
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="bg-card fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl">
          <Dialog.Title className="sr-only">Search VistaTeacher</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search educators, resources, and discussions.
          </Dialog.Description>
          <div className="flex h-14 items-center gap-3 border-b px-4">
            {loading ? (
              <LoaderCircle
                aria-hidden="true"
                className="text-primary size-5 animate-spin"
              />
            ) : (
              <Search
                aria-hidden="true"
                className="text-muted-foreground size-5"
              />
            )}
            <input
              autoFocus
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Search teachers, resources, discussions..."
              className="h-full flex-1 bg-transparent text-sm outline-none"
            />
            <Dialog.Close
              className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-8 place-items-center rounded-lg"
              aria-label="Close search"
            >
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
          </div>
          <div className="max-h-[65vh] overflow-y-auto p-2">
            {query.trim().length < 2 ? (
              <p className="text-muted-foreground px-3 py-10 text-center text-sm">
                Type at least two characters to search.
              </p>
            ) : !loading && !hasResults ? (
              <p className="text-muted-foreground px-3 py-10 text-center text-sm">
                No matching results.
              </p>
            ) : (
              <>
                <ResultGroup title="Educators">
                  {results.educators.map((educator) => (
                    <ResultButton
                      key={educator.uid}
                      onClick={() => navigate(`/profile/${educator.uid}`)}
                      icon={
                        <UserAvatar
                          name={educator.displayName}
                          photoURL={educator.photoURL}
                          className="size-9 rounded-full text-xs"
                        />
                      }
                      title={educator.displayName}
                      detail={`${educator.gradeLevel} · ${educator.subjects.join(", ")}`}
                    />
                  ))}
                </ResultGroup>
                <ResultGroup title="Resources">
                  {results.resources.map((resource) => (
                    <ResultButton
                      key={resource.id}
                      onClick={() => navigate(`/resources/${resource.id}`)}
                      icon={<BookOpen aria-hidden="true" className="size-4" />}
                      title={resource.title}
                      detail={resource.type}
                    />
                  ))}
                </ResultGroup>
                <ResultGroup title="Discussions">
                  {results.discussions.map((discussion) => (
                    <ResultButton
                      key={discussion.id}
                      onClick={() => navigate(`/forum/${discussion.id}`)}
                      icon={
                        <FileQuestion aria-hidden="true" className="size-4" />
                      }
                      title={discussion.title}
                      detail="Forum discussion"
                    />
                  ))}
                </ResultGroup>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ResultGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="not-last:mb-2">
      <h2 className="text-muted-foreground px-3 py-2 text-[10px] font-bold tracking-widest uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ResultButton({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
    >
      <span className="text-primary bg-secondary grid size-9 shrink-0 place-items-center rounded-lg">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {detail}
        </span>
      </span>
    </button>
  );
}
