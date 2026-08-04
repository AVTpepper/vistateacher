import { describe, expect, it } from "vitest";

import { decodeFeedCursor, encodeFeedCursor } from "@/lib/feed/cursor";

describe("feed cursors", () => {
  it("round trips a stable cursor", () => {
    const cursor = { createdAtMillis: 1_700_000_000_000, documentId: "post-1" };
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed and incomplete cursors", () => {
    expect(decodeFeedCursor("not-base64-json")).toBeNull();
    expect(
      decodeFeedCursor(
        Buffer.from(JSON.stringify({ documentId: "post-1" })).toString(
          "base64url",
        ),
      ),
    ).toBeNull();
  });
});
