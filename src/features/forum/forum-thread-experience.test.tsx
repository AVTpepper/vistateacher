import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ForumThreadExperience } from "@/features/forum/forum-thread-experience";
import type { ForumThreadDetail } from "@/lib/forum/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

const initialData: ForumThreadDetail = {
  thread: {
    id: "thread-one",
    author: {
      uid: "author",
      displayName: "Alex Rivera",
      photoURL: null,
      gradeLevel: "Secondary",
      school: "Vista School",
    },
    category: { id: "ideas", name: "Ideas" },
    title: "How do you structure discussion?",
    content: "I would like to hear how other educators approach this.",
    tags: [],
    mentions: [],
    pinned: false,
    locked: false,
    solved: false,
    acceptedReplyId: null,
    viewCount: 4,
    likeCount: 2,
    replyCount: 1,
    createdAt: "2026-08-16T08:00:00.000Z",
    updatedAt: "2026-08-16T08:00:00.000Z",
    editedAt: null,
    lastActivityAt: "2026-08-16T08:00:00.000Z",
    liked: false,
    ownedByViewer: false,
    canModerate: false,
  },
  replies: [
    {
      id: "comment-one",
      parentReplyId: null,
      author: {
        uid: "reviewer",
        displayName: "Jordan Okafor",
        photoURL: null,
        gradeLevel: "Primary",
        school: "Vista School",
      },
      content: "We begin with silent writing.",
      mentions: [],
      likeCount: 0,
      createdAt: "2026-08-16T08:30:00.000Z",
      updatedAt: "2026-08-16T08:30:00.000Z",
      editedAt: null,
      liked: false,
      accepted: false,
      ownedByViewer: false,
      canModerate: false,
    },
  ],
};

describe("ForumThreadExperience", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses comments and likes consistently and replies beneath a comment", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ replyId: "nested-comment" }),
    });
    vi.stubGlobal("fetch", request);
    render(
      <ForumThreadExperience
        initialData={initialData}
        viewer={{
          uid: "viewer",
          displayName: "Marlena Kulasinska",
          photoURL: null,
          role: "educator",
        }}
      />,
    );

    expect(screen.getByText("1 comment")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Add Your Comment" }),
    ).toBeVisible();
    expect(screen.queryByText(/helpful/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Reply to Jordan Okafor..."), {
      target: { value: "That is a useful approach." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post Reply" }));

    await expect(
      screen.findByText("That is a useful approach.", { selector: "p" }),
    ).resolves.toBeVisible();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
      parentReplyId: "comment-one",
      content: "That is a useful approach.",
    });
    expect(screen.getByText("2 comments")).toBeVisible();
    expect(screen.getAllByText("0 likes")).toHaveLength(2);
  }, 10_000);
});
