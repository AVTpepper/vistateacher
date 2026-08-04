export interface FeedCursor {
  createdAtMillis: number;
  documentId: string;
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFeedCursor(value: string | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<FeedCursor>;
    if (
      !Number.isSafeInteger(parsed.createdAtMillis) ||
      Number(parsed.createdAtMillis) < 0 ||
      typeof parsed.documentId !== "string" ||
      !parsed.documentId ||
      parsed.documentId.length > 128
    )
      return null;
    return {
      createdAtMillis: Number(parsed.createdAtMillis),
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}
