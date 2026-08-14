import { describe, expect, it } from "vitest";

import { isRecentlyOnline, ONLINE_WINDOW_MS } from "@/lib/presence/policy";

describe("isRecentlyOnline", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it("treats activity inside the presence window as online", () => {
    expect(
      isRecentlyOnline(new Date(now.getTime() - ONLINE_WINDOW_MS), now),
    ).toBe(true);
  });

  it("does not expose stale, missing, or future activity as online", () => {
    expect(
      isRecentlyOnline(new Date(now.getTime() - ONLINE_WINDOW_MS - 1), now),
    ).toBe(false);
    expect(isRecentlyOnline(null, now)).toBe(false);
    expect(isRecentlyOnline(new Date(now.getTime() + 1), now)).toBe(false);
  });
});
