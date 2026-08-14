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

function activeMention(value: string) {
  return /@([^@\n]{1,40})$/u.exec(value);
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
  const [suggestions, setSuggestions] = useState<MentionTarget[]>([]);
  const match = activeMention(value);
  const query = match?.[1]?.trim() ?? "";

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then(
          (result: { educators?: MentionTarget[] } | null) =>
            setSuggestions(
              (result?.educators ?? [])
                .filter((educator) => educator.uid !== excludeUid)
                .slice(0, 6),
            ),
          () => setSuggestions([]),
        );
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [excludeUid, query]);

  function update(nextValue: string) {
    onValueChange(nextValue);
    onMentionsChange(
      mentions.filter((mention) =>
        nextValue.includes(`@${mention.displayName}`),
      ),
    );
  }

  function select(mention: MentionTarget) {
    const current = activeMention(value);
    if (!current || current.index === undefined) return;
    update(
      `${value.slice(0, current.index)}@${mention.displayName} ${value.slice(current.index + current[0].length)}`,
    );
    onMentionsChange([
      ...mentions.filter((item) => item.uid !== mention.uid),
      mention,
    ]);
    setSuggestions([]);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => update(event.target.value)}
        className={cn("w-full", className)}
        {...props}
      />
      {suggestions.length > 0 && (
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
