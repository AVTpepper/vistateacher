import { describe, expect, it } from "vitest";

import { forumDiscussionResults } from "@/lib/search/forum-results";

const candidates = [
  {
    id: "matching-title",
    title: "A test discussson",
    content: "Share an approach with other educators.",
    categoryId: "general-discussion",
    tags: ["community"],
    moderationStatus: "approved",
  },
  {
    id: "matching-content",
    title: "Classroom routines",
    content: "This discussion includes formative assessment ideas.",
    categoryId: "classroom-management",
    tags: ["routines"],
    moderationStatus: "approved",
  },
  {
    id: "hidden",
    title: "A test discussion awaiting moderation",
    content: "Hidden content.",
    categoryId: "general-discussion",
    tags: ["community"],
    moderationStatus: "pending",
  },
];

describe("forumDiscussionResults", () => {
  it("finds approved discussions by title instead of requiring a matching tag", () => {
    expect(forumDiscussionResults(candidates, "a test discussion")).toEqual([
      {
        id: "matching-title",
        title: "A test discussson",
        categoryId: "general-discussion",
      },
    ]);
  });

  it("finds content matches and excludes unapproved discussions", () => {
    expect(forumDiscussionResults(candidates, "formative assessment")).toEqual([
      {
        id: "matching-content",
        title: "Classroom routines",
        categoryId: "classroom-management",
      },
    ]);
    expect(forumDiscussionResults(candidates, "awaiting moderation")).toEqual(
      [],
    );
  });
});
