import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowButton } from "./follow-button";

const { refresh, error } = vi.hoisted(() => ({
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("connection recovery", () => {
  it("restores an incoming request after an offline failure and supports retry", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    render(
      <FollowButton
        targetUid="teacher"
        connectionStatus="pending"
        connectionDirection="incoming"
        mode="connect"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept request" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Accept request" }),
      ).toBeEnabled(),
    );
    expect(error).toHaveBeenCalledWith("Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Accept request" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Connected" })).toBeEnabled(),
    );
    expect(fetch.mock.calls[1][0]).toBe("/api/network/accept");
  });

  it("restores the latest outgoing state when cancelling fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ok: true }))
        .mockResolvedValueOnce(
          Response.json({ error: "Try later" }, { status: 503 }),
        ),
    );
    render(
      <FollowButton
        targetUid="teacher"
        connectionStatus="none"
        mode="connect"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Request sent" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Request sent" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Request sent" }),
      ).toBeEnabled(),
    );
    expect(error).toHaveBeenCalledWith("Try later");
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Cancel connection request",
    );
  });
});
