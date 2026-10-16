import { describe, expect, it } from "vitest";

import { canFollow } from "@/lib/network/follow-policy";

const validInput = {
  followerUid: "follower",
  followingUid: "educator",
  followerStatus: "active" as const,
  followingStatus: "active" as const,
  alreadyFollowing: false,
};

describe("follow policy", () => {
  it("allows a Community member to connect", () => {
    expect(canFollow(validInput)).toEqual({ allowed: true });
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
