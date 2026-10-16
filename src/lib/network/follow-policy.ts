import type { UserStatus } from "@/types/models";

export type FollowDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "self" | "already-following" | "inactive";
    };

export function canFollow({
  followerUid,
  followingUid,
  followerStatus,
  followingStatus,
  alreadyFollowing,
}: {
  followerUid: string;
  followingUid: string;
  followerStatus: UserStatus;
  followingStatus: UserStatus;
  alreadyFollowing: boolean;
}): FollowDecision {
  if (followerUid === followingUid) return { allowed: false, reason: "self" };
  if (alreadyFollowing) return { allowed: false, reason: "already-following" };
  if (followerStatus !== "active" || followingStatus !== "active")
    return { allowed: false, reason: "inactive" };

  return { allowed: true };
}
