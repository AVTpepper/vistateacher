// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  activityTarget,
  isPublicResource,
  retainModeration,
} from "@/lib/community/visibility";

describe("moderation decisions", () => {
  it.each(["approved", "pending", "rejected"] as const)(
    "retains existing %s decisions during an owner publication",
    (moderationStatus) => {
      expect(retainModeration({ moderationStatus }, "approved")).toBe(
        moderationStatus,
      );
    },
  );

  it("approves new public records and holds malformed existing decisions", () => {
    expect(retainModeration(undefined, "approved")).toBe("approved");
    expect(retainModeration({}, "approved")).toBe("pending");
    expect(retainModeration({ moderationStatus: "unknown" }, "approved")).toBe(
      "pending",
    );
  });

  it.each([
    ["active", "approved", true],
    ["active", "rejected", false],
    ["active", "pending", false],
    ["draft", "approved", false],
    ["uploading", "approved", false],
  ])(
    "requires active and approved: %s/%s",
    (status, moderationStatus, visible) => {
      expect(isPublicResource({ status, moderationStatus })).toBe(visible);
    },
  );
});

describe("canonical activity identity", () => {
  it.each([
    [
      "lesson-published",
      "resource",
      "lesson_lesson-one",
      "resources/lesson_lesson-one",
    ],
    ["resource-published", "resource", "lesson-one", "resources/lesson-one"],
    ["forum-thread", "forumThread", "lesson-one", "forumThreads/lesson-one"],
  ])(
    "resolves stored %s kind and entity ID",
    (activityKind, type, id, path) => {
      expect(
        activityTarget({
          type: "activity",
          activityKind,
          activityEntityId: "lesson-one",
          activityHref: "/resources/untrusted-url",
          activityTitle: "Untrusted title",
        }),
      ).toEqual({ type, id, path });
    },
  );

  it.each([
    {
      type: "post",
      activityKind: "resource-published",
      activityEntityId: "one",
    },
    { type: "activity", activityKind: "unknown", activityEntityId: "one" },
    {
      type: "activity",
      activityKind: "resource-published",
      activityEntityId: "../other",
    },
    { type: "activity", activityKind: "resource-published" },
  ])("rejects malformed source identity", (data) => {
    expect(activityTarget(data)).toBeNull();
  });
});
