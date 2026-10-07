import type { TextareaHTMLAttributes } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostCard } from "@/features/feed/post-card";
import type { FeedPost } from "@/lib/feed/server";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/features/mentions/mention-textarea", () => ({
  MentionTextarea: ({
    onValueChange,
    mentions: _mentions,
    onMentionsChange: _change,
    excludeUid: _exclude,
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
    onValueChange: (value: string) => void;
    mentions?: unknown;
    onMentionsChange?: unknown;
    excludeUid?: string;
  }) => {
    void _mentions;
    void _change;
    void _exclude;
    return (
      <textarea
        {...props}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  },
}));

const post: FeedPost = {
  id: "post-one",
  author: {
    uid: "owner",
    displayName: "Alex",
    photoURL: null,
    gradeLevel: "Primary",
    school: "School",
  },
  type: "post",
  content: "A classroom idea",
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
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  editedAt: null,
  liked: false,
  bookmarked: false,
  ownedByViewer: true,
};
const viewer = { uid: "owner", displayName: "Alex", photoURL: null };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe("feed recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rolls back a failed like without undoing a simultaneous bookmark", async () => {
    let rejectLike!: (error: Error) => void;
    const fetch = vi.fn().mockImplementation((url: string) =>
      url.endsWith("/like")
        ? new Promise((_resolve, reject) => {
            rejectLike = reject;
          })
        : Promise.resolve(response({ saved: true })),
    );
    vi.stubGlobal("fetch", fetch);
    render(<PostCard initialPost={post} viewer={viewer} />);
    fireEvent.click(screen.getByRole("button", { name: "Like post" }));
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove saved post" }),
      ).toBeEnabled(),
    );
    rejectLike(new Error("offline"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Like post" })).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "Remove saved post" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 likes")).toBeInTheDocument();
  });

  it("retries failed comment loading", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response({ comments: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<PostCard initialPost={post} viewer={viewer} />);
    fireEvent.click(screen.getByRole("button", { name: "Comment on post" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry comments" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry comments" }),
      ).not.toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps a comment draft and enables retry after a lost connection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(
      <PostCard initialPost={post} initialComments={[]} viewer={viewer} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Write a comment..."), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send comment" }),
      ).toBeEnabled(),
    );
    expect(screen.getByPlaceholderText("Write a comment...")).toHaveValue(
      "Keep this draft",
    );
    expect(screen.getByText("0 comments")).toBeInTheDocument();
  });
});
