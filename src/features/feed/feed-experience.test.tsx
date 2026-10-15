import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreatePostInput } from "@/schemas/feed";
import type { FeedPost } from "@/lib/feed/server";
import { FeedExperience } from "./feed-experience";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/feed/feed-composer", () => ({
  FeedComposer: ({
    onCreate,
  }: {
    onCreate: (input: CreatePostInput) => Promise<boolean>;
  }) => (
    <button
      onClick={() =>
        void onCreate({
          type: "post",
          content: "New lesson idea",
          imageURLs: [],
          fileAttachments: [],
          linkURLs: [],
          tags: [],
          resourceId: null,
        })
      }
    >
      Publish idea
    </button>
  ),
}));
vi.mock("@/features/feed/post-card", () => ({
  PostCard: ({ initialPost }: { initialPost: FeedPost }) => (
    <article>{initialPost.content}</article>
  ),
}));

const account = {
  uid: "owner",
  displayName: "Alex",
  photoURL: null,
  gradeLevel: "Primary",
  school: "School",
};
function post(id: string): FeedPost {
  return {
    id,
    content: id,
    author: account,
    type: "post",
    imageURLs: [],
    fileAttachments: [],
    linkURLs: [],
    tags: [],
    mentions: [],
    resourceId: null,
    activity: null,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    bookmarkCount: 0,
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
    editedAt: null,
    liked: false,
    bookmarked: false,
    ownedByViewer: true,
  };
}
const response = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

describe("feed continuity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves loaded pages and pagination when publishing a confirmed post", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ posts: [post("second page")], nextCursor: "next-page" }),
      )
      .mockResolvedValueOnce(
        response({ postId: "confirmed", post: post("confirmed") }),
      )
      .mockResolvedValueOnce(
        response({ posts: [post("third page")], nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <FeedExperience
        initialPage={{ posts: [post("first page")], nextCursor: "second-page" }}
        account={account}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more posts" }));
    await screen.findByText("second page");
    fireEvent.click(screen.getByRole("button", { name: "Publish idea" }));
    await screen.findByText("confirmed");
    expect(screen.getByText("first page")).toBeInTheDocument();
    expect(screen.getByText("second page")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Load more posts" }));
    await screen.findByText("third page");
    expect(fetch.mock.calls[2][0]).toContain("cursor=next-page");
  });

  it("deduplicates overlapping pages without changing Saved ordering", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({
            posts: [post("saved first"), post("saved second")],
            nextCursor: null,
          }),
        ),
    );
    render(
      <FeedExperience
        initialView="saved"
        initialPage={{ posts: [post("saved first")], nextCursor: "more" }}
        account={account}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more posts" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(
      screen.getAllByRole("article").map((item) => item.textContent),
    ).toEqual(["saved first", "saved second"]);
  });
});
