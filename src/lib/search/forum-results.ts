import { normalizeSearchText } from "@/lib/search/normalize";

export interface ForumSearchCandidate {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  tags: string[];
  moderationStatus: string;
}

export interface ForumDiscussionSearchResult {
  id: string;
  title: string;
  categoryId: string;
}

function withinOneEdit(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}

export function forumDiscussionResults(
  candidates: ForumSearchCandidate[],
  rawQuery: string,
  limit = 5,
): ForumDiscussionSearchResult[] {
  const query = normalizeSearchText(rawQuery);
  const tokens = query.split(" ").filter((token) => token.length >= 2);

  return candidates
    .filter((candidate) => candidate.moderationStatus === "approved")
    .map((candidate) => {
      const title = normalizeSearchText(candidate.title);
      const tags = normalizeSearchText(candidate.tags.join(" "));
      const haystack = normalizeSearchText(
        [
          candidate.title,
          candidate.content,
          candidate.categoryId,
          ...candidate.tags,
        ].join(" "),
      );
      const candidateTokens = haystack.split(" ").filter(Boolean);
      const matchesPhrase = query.length >= 2 && haystack.includes(query);
      const matchesTokens =
        tokens.length > 0 &&
        tokens.every((token) =>
          candidateTokens.some(
            (candidateToken) =>
              candidateToken.includes(token) ||
              withinOneEdit(token, candidateToken),
          ),
        );
      if (!matchesPhrase && !matchesTokens) return null;

      const score =
        title === query
          ? 0
          : title.startsWith(query)
            ? 1
            : title.includes(query)
              ? 2
              : tags.includes(query)
                ? 3
                : 4;
      return { candidate, score };
    })
    .filter(
      (result): result is { candidate: ForumSearchCandidate; score: number } =>
        result !== null,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.candidate.title.localeCompare(right.candidate.title),
    )
    .slice(0, limit)
    .map(({ candidate }) => ({
      id: candidate.id,
      title: candidate.title,
      categoryId: candidate.categoryId,
    }));
}
