import { describe, expect, it } from "vitest";

import { BURST_WINDOW_MS, nextBurstUsage } from "./burst-policy";

describe("burst policy", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("starts a window and allows its final action", () => {
    expect(nextBurstUsage(null, 0, 20, now)).toEqual({
      startedAt: now,
      count: 1,
    });
    expect(nextBurstUsage(now, 19, 20, now)?.count).toBe(20);
    expect(nextBurstUsage(now, 20, 20, now)).toBeNull();
  });
  it("recovers at the exact window boundary without a daily lockout", () => {
    const startedAt = new Date(now.getTime() - BURST_WINDOW_MS);
    expect(nextBurstUsage(startedAt, 20, 20, now)).toEqual({
      startedAt: now,
      count: 1,
    });
    expect(
      nextBurstUsage(new Date(startedAt.getTime() + 1), 20, 20, now),
    ).toBeNull();
  });
});
