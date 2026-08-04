import { describe, expect, it } from "vitest";

import { canFollow } from "@/lib/network/follow-policy";

const validInput = {
  followerUid: "follower",
  followingUid: "educator",
  followerStatus: "active" as const,
  followingStatus: "active" as const,
  alreadyFollowing: false,
  followingCount: 4,
  plan: "free" as const,
};

describe("follow policy", () => {
  it("allows a Free member below the centralized limit", () => {
    expect(canFollow(validInput)).toEqual({ allowed: true });
  });

  it("stops a Free member at five connections", () => {
    expect(canFollow({ ...validInput, followingCount: 5 })).toEqual({
      allowed: false,
      reason: "limit-reached",
    });
  });

  it("keeps Plus connections unlimited", () => {
    expect(
      canFollow({ ...validInput, followingCount: 50_000, plan: "plus" }),
    ).toEqual({ allowed: true });
  });

  it("rejects self-follow, duplicates, and inactive accounts", () => {
    expect(
      canFollow({ ...validInput, followingUid: validInput.followerUid }),
    ).toMatchObject({ reason: "self" });
    expect(canFollow({ ...validInput, alreadyFollowing: true })).toMatchObject({
      reason: "already-following",
    });
    expect(
      canFollow({ ...validInput, followingStatus: "suspended" }),
    ).toMatchObject({ reason: "inactive" });
  });
});
