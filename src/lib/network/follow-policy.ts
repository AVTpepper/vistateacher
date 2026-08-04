import { PLAN_ENTITLEMENTS } from "@/lib/entitlements/plan-entitlements";
import type { Plan, UserStatus } from "@/types/models";

export type FollowDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "self" | "already-following" | "inactive" | "limit-reached";
    };

export function canFollow({
  followerUid,
  followingUid,
  followerStatus,
  followingStatus,
  alreadyFollowing,
  followingCount,
  plan,
}: {
  followerUid: string;
  followingUid: string;
  followerStatus: UserStatus;
  followingStatus: UserStatus;
  alreadyFollowing: boolean;
  followingCount: number;
  plan: Plan;
}): FollowDecision {
  if (followerUid === followingUid) return { allowed: false, reason: "self" };
  if (alreadyFollowing) return { allowed: false, reason: "already-following" };
  if (followerStatus !== "active" || followingStatus !== "active")
    return { allowed: false, reason: "inactive" };

  const limit = PLAN_ENTITLEMENTS[plan].maxConnections;
  if (limit !== null && followingCount >= limit)
    return { allowed: false, reason: "limit-reached" };

  return { allowed: true };
}
