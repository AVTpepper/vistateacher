import { describe, expect, it } from "vitest";

import { createConversationId } from "@/lib/messages/conversation-id";
import {
  createSearchKeywords,
  normalizeSearchText,
} from "@/lib/search/normalize";

describe("createConversationId", () => {
  it("is deterministic regardless of caller order", () => {
    expect(createConversationId("teacher-b", "teacher-a")).toBe(
      createConversationId("teacher-a", "teacher-b"),
    );
  });

  it("rejects self conversations", () => {
    expect(() => createConversationId("teacher-a", "teacher-a")).toThrow();
  });
});

describe("search normalization", () => {
  it("normalizes casing, accents, and punctuation", () => {
    expect(normalizeSearchText("  José's SCIENCE! ")).toBe("jose s science");
  });

  it("deduplicates explicit search keywords", () => {
    expect(createSearchKeywords(["Math Teacher", "math"])).toEqual([
      "math",
      "teacher",
    ]);
  });
});
