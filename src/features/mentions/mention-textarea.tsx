"use client";

import { forwardRef, useEffect, useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { MentionTarget } from "@/lib/mentions/types";
import { cn } from "@/lib/utils";

interface MentionTextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> {
  value: string;
  onValueChange: (value: string) => void;
  mentions: MentionTarget[];
  onMentionsChange: (mentions: MentionTarget[]) => void;
  excludeUid?: string;
}

interface SuggestionResult {
  query: string;
  educators: MentionTarget[];
}

function activeMention(value: string, mentions: MentionTarget[] = []) {
  const match = /@([^@\n]{1,40})$/u.exec(value);
  const candidate = match?.[1] ?? "";
  const beginsWithSelectedMention = mentions.some(
    (mention) =>
      candidate === mention.displayName ||
      candidate.startsWith(`${mention.displayName} `),
  );
  return beginsWithSelectedMention ? null : match;
}

export const MentionTextarea = forwardRef<
  HTMLTextAreaElement,
  MentionTextareaProps
>(function MentionTextarea(
  {
    value,
    onValueChange,
    mentions,
    onMentionsChange,
    excludeUid,
    className,
    ...props
  },
  ref,
) {
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult>({
    query: "",
    educators: [],
  });
  const [dismissedMention, setDismissedMention] = useState<{
    index: number;
    displayName: string;
  } | null>(null);
  const candidateMatch = activeMention(value, mentions);
  const matchesDismissedMention =
    dismissedMention &&
    candidateMatch?.index === dismissedMention.index &&
    candidateMatch[0].startsWith(`@${dismissedMention.displayName}`);
  const match = matchesDismissedMention ? null : candidateMatch;
  const query = match?.[1]?.trim() ?? "";
  const suggestions =
    suggestionResult.query === query ? suggestionResult.educators : [];

  useEffect(() => {
    if (query.length < 2) {
      setSuggestionResult({ query: "", educators: [] });
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then(
          (result: { educators?: MentionTarget[] } | null) => {
            if (!active) return;
            setSuggestionResult({
              query,
              educators: (result?.educators ?? [])
                .filter((educator) => educator.uid !== excludeUid)
                .slice(0, 6),
            });
          },
          () => {
            if (active) setSuggestionResult({ query, educators: [] });
          },
        );
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [excludeUid, query]);

  function update(nextValue: string) {
    setDismissedMention((current) =>
      current &&
      nextValue.slice(current.index).startsWith(`@${current.displayName}`)
        ? current
        : null,
    );
    onValueChange(nextValue);
    onMentionsChange(
      mentions.filter((mention) =>
        nextValue.includes(`@${mention.displayName}`),
      ),
    );
  }

  function select(mention: MentionTarget) {
    const current = activeMention(value, mentions);
    if (!current || current.index === undefined) return;
    update(
      `${value.slice(0, current.index)}@${mention.displayName} ${value.slice(current.index + current[0].length)}`,
    );
    onMentionsChange([
      ...mentions.filter((item) => item.uid !== mention.uid),
      mention,
    ]);
    setDismissedMention({
      index: current.index,
      displayName: mention.displayName,
    });
    setSuggestionResult({ query: "", educators: [] });
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => update(event.target.value)}
        className={cn(
          "border-accent bg-input/60 text-foreground placeholder:text-muted-foreground focus-visible:border-ring min-h-24 w-full min-w-0 rounded-md border px-3 py-2.5 text-base shadow-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      />
      {query.length >= 2 && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Mention an educator"
          className="bg-popover absolute right-0 bottom-full left-0 z-20 mb-1 max-h-56 overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.uid}
              type="button"
              role="option"
              aria-label={suggestion.displayName}
              aria-selected={mentions.some(
                (mention) => mention.uid === suggestion.uid,
              )}
              onClick={() => select(suggestion)}
              className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm"
            >
              <UserAvatar
                name={suggestion.displayName}
                photoURL={null}
                className="size-7 rounded-full text-[9px]"
              />
              <span className="font-semibold">{suggestion.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
