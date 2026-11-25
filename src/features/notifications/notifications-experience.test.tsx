import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsExperience } from "./notifications-experience";
import type { NotificationItem } from "@/lib/messages/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./notification-provider", () => ({
  useNotifications: () => ({
    page: null,
    error: false,
    refresh: async () => undefined,
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const item = (id: string): NotificationItem => ({
  id,
  type: "post-like",
  actorId: id,
  actorName: `Teacher ${id}`,
  entityId: "post",
  message: `Teacher ${id} liked your post.`,
  href: "/post/post",
  read: false,
  archived: false,
  createdAt: "2026-11-24T10:00:00Z",
});

describe("notification recovery", () => {
  it("moves focus to the next update when archiving removes the focused row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ok: true })),
    );
    render(
      <NotificationsExperience
        initialPage={{
          notifications: [item("a"), { ...item("b"), entityId: "other-post" }],
          nextCursor: null,
          unreadCount: 2,
        }}
      />,
    );
    const first = screen.getAllByRole("article")[0];
    const archive = within(first).getByRole("button", {
      name: "Archive",
    });
    archive.focus();
    fireEvent.click(archive);
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Teacher b liked your post." }),
      ).toHaveFocus(),
    );
  });

  it("does not steal focus moved by the teacher while a row action is pending", async () => {
    let complete!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
      ),
    );
    render(
      <NotificationsExperience
        initialPage={{
          notifications: [item("a"), { ...item("b"), entityId: "other-post" }],
          nextCursor: null,
          unreadCount: 2,
        }}
      />,
    );
    const archive = within(screen.getAllByRole("article")[0]).getByRole(
      "button",
      { name: "Archive" },
    );
    archive.focus();
    fireEvent.click(archive);
    const next = screen.getByRole("link", {
      name: "Teacher b liked your post.",
    });
    next.focus();
    complete(Response.json({ ok: true }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(next).toHaveFocus();
  });

  it("clears pending state after an offline failure so the action can be retried", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("offline"))
        .mockResolvedValueOnce(Response.json({ ok: true })),
    );
    render(
      <NotificationsExperience
        initialPage={{
          notifications: [item("a")],
          nextCursor: null,
          unreadCount: 1,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark as read" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await screen.findByRole("button", { name: "Mark as unread" });
  });

  it("keeps a successful group update when another item fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ok: true }))
        .mockRejectedValueOnce(new TypeError("offline"))
        .mockResolvedValueOnce(
          Response.json({
            notifications: [item("b")],
            nextCursor: null,
            unreadCount: 1,
          }),
        ),
    );
    render(
      <NotificationsExperience
        initialPage={{
          notifications: [item("a"), item("b")],
          nextCursor: null,
          unreadCount: 2,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark as read" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    await waitFor(() =>
      expect(screen.getByText("Teacher b liked your post.")).toBeVisible(),
    );
    expect(
      screen.queryByText("Teacher a liked your post."),
    ).not.toBeInTheDocument();
  });

  it("retains the pagination cursor after failure and deduplicates a successful retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json({
          notifications: [item("a"), { ...item("b"), entityId: "other-post" }],
          nextCursor: null,
          unreadCount: 2,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    render(
      <NotificationsExperience
        initialPage={{
          notifications: [item("a")],
          nextCursor: "next-page",
          unreadCount: 2,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(
      within(screen.getAllByRole("article")[0]).getByText(
        "Teacher a liked your post.",
      ),
    ).toBeVisible();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/notifications?filter=all&cursor=next-page",
      "/api/notifications?filter=all&cursor=next-page",
    ]);
  });
});
