import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import {
  PLAN_ENTITLEMENTS,
  resolveEffectivePlan,
} from "@/lib/entitlements/plan-entitlements";
import { getFeedPage, type FeedPost } from "@/lib/feed/server";
import { adminDb } from "@/lib/firebase/admin";
import { getForumPage, type ForumThreadSummary } from "@/lib/forum/server";
import {
  projectAnalytics,
  type AnalyticsView,
} from "@/lib/dashboard/analytics-policy";
import {
  getNetworkList,
  type EducatorDiscoveryResult,
} from "@/lib/network/server";
import {
  listOwnedResources,
  listResources,
  type ResourceSummary,
} from "@/lib/resources/server";
import { userAnalyticsAggregateSchema } from "@/schemas/dashboard";
import { profileDocumentSchema } from "@/schemas/profile";
import type {
  Plan,
  SubscriptionRecord,
  SubscriptionStatus,
  UserRole,
} from "@/types/models";

export interface DashboardQuota {
  label: string;
  used: number;
  limit: number | null;
  period: "day" | "month" | "total";
  href: string;
}

export interface DashboardData {
  viewer: {
    uid: string;
    firstName: string;
    displayName: string;
    photoURL: string | null;
    subjects: string[];
    gradeLevel: string;
    connectionCount: number;
    resourceCount: number;
    postCount: number;
  };
  plan: Plan;
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
  };
  analytics: AnalyticsView;
  quotas: DashboardQuota[];
  recommendations: {
    educators: EducatorDiscoveryResult[];
    resources: ResourceSummary[];
    posts: FeedPost[];
    discussions: ForumThreadSummary[];
  };
  topResources: ResourceSummary[];
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function date(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function subscriptionRecord(
  data: FirebaseFirestore.DocumentData | undefined,
): SubscriptionRecord | null {
  if (!data) return null;
  return {
    plan: data.plan === "plus" ? "plus" : "free",
    status: String(data.status ?? "free") as SubscriptionStatus,
    stripeCustomerId:
      typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null,
    stripeSubscriptionId:
      typeof data.stripeSubscriptionId === "string"
        ? data.stripeSubscriptionId
        : null,
    stripePriceId:
      typeof data.stripePriceId === "string" ? data.stripePriceId : null,
    billingInterval:
      data.billingInterval === "month" || data.billingInterval === "year"
        ? data.billingInterval
        : null,
    currentPeriodEnd: date(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    trialStartedAt: date(data.trialStartedAt),
    trialEndsAt: date(data.trialEndsAt),
    trialConsumed: data.trialConsumed === true,
    updatedAt: date(data.updatedAt) ?? new Date(0),
  };
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function rankResource(
  resource: ResourceSummary,
  subjects: string[],
  gradeLevel: string,
): number {
  return (
    Number(
      subjects.some(
        (subject) => subject.toLowerCase() === resource.subject.toLowerCase(),
      ),
    ) *
      4 +
    Number(resource.gradeLevel === gradeLevel) * 2 +
    Math.min(resource.ratingAverage, 5) +
    Math.min(resource.downloadCount / 100, 3)
  );
}

async function getLiveAnalytics(
  uid: string,
  stored: ReturnType<typeof userAnalyticsAggregateSchema.parse>,
) {
  const db = adminDb();
  const [posts, resources, threads, replies, lessons] = await Promise.all([
    db.collection("posts").where("authorId", "==", uid).get(),
    db.collection("resources").where("authorId", "==", uid).get(),
    db.collection("forumThreads").where("authorId", "==", uid).get(),
    db.collectionGroup("replies").where("authorId", "==", uid).get(),
    db.collection("lessons").where("ownerId", "==", uid).get(),
  ]);
  return {
    ...stored,
    postEngagements: posts.docs.reduce(
      (total, document) =>
        total +
        number(document.data().likeCount) +
        number(document.data().commentCount) +
        number(document.data().shareCount) +
        number(document.data().bookmarkCount),
      0,
    ),
    resourceDownloadsTotal: resources.docs.reduce(
      (total, document) => total + number(document.data().downloadCount),
      0,
    ),
    forumContributions: threads.size + replies.size,
    lessonsGeneratedTotal: lessons.size,
  };
}

export async function getDashboardData(
  uid: string,
  role: UserRole,
  now = new Date(),
): Promise<DashboardData> {
  const db = adminDb();
  const [
    profileSnapshot,
    subscriptionSnapshot,
    analyticsSnapshot,
    dailyUsage,
    monthlyUsage,
  ] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`subscriptions/${uid}`).get(),
    db.doc(`userAnalytics/${uid}`).get(),
    db.doc(`usage/${uid}_${dayKey(now)}`).get(),
    db.doc(`usage/${uid}_${monthKey(now)}`).get(),
  ]);
  const profile = profileDocumentSchema.parse(profileSnapshot.data());
  const subscription = subscriptionRecord(subscriptionSnapshot.data());
  const plan = resolveEffectivePlan(subscription, now);
  const entitlements = PLAN_ENTITLEMENTS[plan];
  const storedAnalytics = userAnalyticsAggregateSchema.parse(
    analyticsSnapshot.data() ?? {},
  );

  const [aggregate, educators, resources, ownedResources, feed, forum] =
    await Promise.all([
      getLiveAnalytics(uid, storedAnalytics),
      getNetworkList(uid, uid, "suggestions"),
      listResources({ query: "", type: "", subject: "", sort: "rating" }),
      listOwnedResources(uid),
      getFeedPage(uid, "all"),
      getForumPage(uid, role, { categoryId: "", cursor: undefined }),
    ]);
  const recommendedResources = resources
    .filter((resource) => resource.author.uid !== uid)
    .sort(
      (left, right) =>
        rankResource(right, profile.subjects, profile.gradeLevel) -
        rankResource(left, profile.subjects, profile.gradeLevel),
    )
    .slice(0, 3);
  const posts = feed.posts
    .filter((post) => !post.ownedByViewer)
    .sort(
      (left, right) =>
        right.likeCount +
        right.commentCount -
        (left.likeCount + left.commentCount),
    )
    .slice(0, 3);
  const firstName = profile.displayName.trim().split(/\s+/)[0] ?? "Educator";

  return {
    viewer: {
      uid,
      firstName,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      subjects: profile.subjects,
      gradeLevel: profile.gradeLevel,
      connectionCount: profile.connectionCount,
      resourceCount: profile.resourceCount,
      postCount: profile.postCount,
    },
    plan,
    subscription: {
      status: subscription?.status ?? "free",
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    },
    analytics: projectAnalytics(plan, aggregate),
    quotas: [
      {
        label: "Connections",
        used: profile.connectionCount,
        limit: entitlements.maxConnections,
        period: "total",
        href: "/network",
      },
      {
        label: "Messages",
        used: number(dailyUsage.data()?.messages),
        limit: entitlements.messagesPerDay,
        period: "day",
        href: "/messages",
      },
      {
        label: "Resource uploads",
        used: number(monthlyUsage.data()?.resourceUploads),
        limit: entitlements.resourceUploadsPerMonth,
        period: "month",
        href: "/resources",
      },
      {
        label: "Resource downloads",
        used: number(monthlyUsage.data()?.resourceDownloads),
        limit: entitlements.resourceDownloadsPerMonth,
        period: "month",
        href: "/resources",
      },
      {
        label: "AI generations",
        used: number(monthlyUsage.data()?.aiLessons),
        limit: entitlements.aiLessonsPerMonth,
        period: "month",
        href: "/ai-lessons",
      },
      {
        label: "Lesson exports",
        used: number(monthlyUsage.data()?.lessonExports),
        limit: entitlements.lessonExportsPerMonth,
        period: "month",
        href: "/ai-lessons",
      },
    ],
    recommendations: {
      educators: educators.slice(0, 4),
      resources: recommendedResources,
      posts,
      discussions: forum.threads.slice(0, 3),
    },
    topResources: ownedResources
      .sort((left, right) => right.downloadCount - left.downloadCount)
      .slice(0, 4),
  };
}
