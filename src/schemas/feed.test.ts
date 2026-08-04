import { describe, expect, it } from "vitest";

import {
  createCommentSchema,
  createPostSchema,
  feedQuerySchema,
  reportPostSchema,
} from "@/schemas/feed";

describe("feed schemas", () => {
  it.each(["post", "question", "resource"] as const)(
    "accepts a bounded %s",
    (type) => {
      expect(
        createPostSchema.parse({
          type,
          content: "A useful classroom observation.",
          tags: ["Science", "Grade 7"],
        }),
      ).toMatchObject({ type, imageURLs: [], resourceId: null });
    },
  );

  it("rejects empty content, unsafe tags, and too many images", () => {
    expect(
      createPostSchema.safeParse({ type: "post", content: " " }).success,
    ).toBe(false);
    expect(
      createPostSchema.safeParse({
        type: "post",
        content: "Hello",
        tags: ["<script>"],
      }).success,
    ).toBe(false);
    expect(
      createPostSchema.safeParse({
        type: "post",
        content: "Hello",
        imageURLs: Array.from(
          { length: 5 },
          (_, index) => `https://example.test/${index}.png`,
        ),
      }).success,
    ).toBe(false);
  });

  it("validates feed filters and bounded interaction payloads", () => {
    expect(feedQuerySchema.parse({})).toEqual({ view: "all" });
    expect(feedQuerySchema.safeParse({ view: "unknown" }).success).toBe(false);
    expect(
      createCommentSchema.safeParse({ postId: "post-1", content: " " }).success,
    ).toBe(false);
    expect(
      reportPostSchema.safeParse({
        postId: "post-1",
        reason: "spam",
        details: "Repeated promotional links.",
      }).success,
    ).toBe(true);
  });
});
