import Link from "next/link";

import type { MentionTarget } from "@/lib/mentions/types";

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MentionText({
  content,
  mentions,
}: {
  content: string;
  mentions: MentionTarget[];
}) {
  const byLabel = new Map(
    mentions.map((mention) => [`@${mention.displayName}`, mention]),
  );
  if (!byLabel.size) return content;
  const pattern = new RegExp(
    `(${[...byLabel.keys()]
      .sort((left, right) => right.length - left.length)
      .map(escapePattern)
      .join("|")})`,
    "g",
  );
  return content.split(pattern).map((part, index) => {
    const mention = byLabel.get(part);
    return mention ? (
      <Link
        key={`${mention.uid}-${index}`}
        href={`/profile/${mention.uid}`}
        className="text-primary font-semibold hover:underline"
      >
        {part}
      </Link>
    ) : (
      part
    );
  });
}
