export interface ForumCursor {
  lastActivityAtMillis: number;
  documentId: string;
}

export function encodeForumCursor(cursor: ForumCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeForumCursor(
  value: string | undefined,
): ForumCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ForumCursor>;
    if (
      !Number.isSafeInteger(parsed.lastActivityAtMillis) ||
      Number(parsed.lastActivityAtMillis) < 0 ||
      typeof parsed.documentId !== "string" ||
      !parsed.documentId ||
      parsed.documentId.length > 128
    )
      return null;
    return {
      lastActivityAtMillis: Number(parsed.lastActivityAtMillis),
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}
