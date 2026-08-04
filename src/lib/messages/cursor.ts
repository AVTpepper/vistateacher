interface MessageCursor {
  createdAt: number;
  id: string;
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMessageCursor(value: string): MessageCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<MessageCursor>;
    if (
      !Number.isSafeInteger(parsed.createdAt) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    )
      return null;
    return { createdAt: parsed.createdAt, id: parsed.id } as MessageCursor;
  } catch {
    return null;
  }
}
