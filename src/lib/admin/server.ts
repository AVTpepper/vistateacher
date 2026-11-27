import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { activityTarget } from "@/lib/community/visibility";
import type { AdminAction } from "@/schemas/admin";
import type { UserRole } from "@/types/models";

export interface AdminActor {
  uid: string;
  role: UserRole;
}

export interface AdminOverview {
  totals: {
    users: number;
    plusSubscribers: number;
    posts: number;
    resources: number;
    forumThreads: number;
    pendingReports: number;
    pendingVerifications: number;
  };
  updatedAt: string | null;
  auditLogs: AdminAuditLog[];
}

export interface AdminAuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string | null;
}

export interface AdminUserRow {
  uid: string;
  displayName: string;
  role: UserRole;
  status: "active" | "suspended" | "deleted";
  isVerified: boolean;
  plan: "free" | "plus";
  school: string;
  createdAt: string | null;
}

export interface AdminContentRow {
  id: string;
  type: "post" | "resource" | "forumThread";
  title: string;
  ownerId: string;
  moderationStatus: "pending" | "approved" | "rejected";
  reportCount: number;
  createdAt: string | null;
}

export interface AdminReportRow {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  parentId: string | null;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string | null;
  target: AdminReportTarget | null;
}

export interface AdminReportTarget {
  type: "post" | "resource" | "forumThread" | "forumReply";
  id: string;
  parentId: string | null;
  title: string;
  preview: string;
  moderationStatus: "pending" | "approved" | "rejected";
  announcement: {
    id: string;
    moderationStatus: "pending" | "approved" | "rejected";
  } | null;
}

export interface AdminVerificationRow {
  id: string;
  uid: string;
  evidencePath: string | null;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  createdAt: string | null;
}

type AdminErrorCode =
  | "admin-required"
  | "conflict"
  | "invalid-target"
  | "not-found"
  | "protected-target";

export class AdminActionError extends Error {
  constructor(public readonly code: AdminErrorCode) {
    super(code);
  }
}

function assertAdmin(actor: AdminActor): void {
  if (actor.role !== "platform_admin")
    throw new AdminActionError("admin-required");
}

function date(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function moderationStatus(value: unknown): "pending" | "approved" | "rejected" {
  return value === "approved" || value === "rejected" ? value : "pending";
}

export async function getAdminOverview(
  actor: AdminActor,
): Promise<AdminOverview> {
  assertAdmin(actor);
  const db = adminDb();
  const [stats, audits, reports] = await Promise.all([
    db.doc("platformStats/current").get(),
    db.collection("auditLogs").orderBy("createdAt", "desc").limit(12).get(),
    db
      .collection("reports")
      .where("status", "in", ["open", "pending"])
      .count()
      .get(),
  ]);
  const data = stats.data() ?? {};
  return {
    totals: {
      users: count(data.totalUsers),
      plusSubscribers: count(data.plusSubscribers),
      posts: count(data.posts),
      resources: count(data.resources),
      forumThreads: count(data.forumThreads),
      pendingReports: count(reports.data().count),
      pendingVerifications: count(data.pendingVerifications),
    },
    updatedAt: date(data.updatedAt),
    auditLogs: audits.docs.map((document) => ({
      id: document.id,
      actorId: String(document.data().actorId ?? ""),
      action: String(document.data().action ?? ""),
      targetType: String(document.data().targetType ?? ""),
      targetId: String(document.data().targetId ?? ""),
      reason: String(document.data().reason ?? ""),
      createdAt: date(document.data().createdAt),
    })),
  };
}

export async function getAdminUsers(
  actor: AdminActor,
): Promise<AdminUserRow[]> {
  assertAdmin(actor);
  const db = adminDb();
  const users = await db
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const subscriptions = users.empty
    ? []
    : await db.getAll(
        ...users.docs.map((document) => db.doc(`subscriptions/${document.id}`)),
      );
  const plans = new Map(
    subscriptions.map(
      (subscription) =>
        [
          subscription.id,
          subscription.data()?.plan === "plus" ? "plus" : "free",
        ] as const,
    ),
  );
  return users.docs.map((document) => {
    const data = document.data();
    const role: UserRole =
      data.role === "platform_admin" || data.role === "school_admin"
        ? data.role
        : "educator";
    const status =
      data.status === "suspended" || data.status === "deleted"
        ? data.status
        : "active";
    return {
      uid: document.id,
      displayName: String(data.displayName ?? "Educator"),
      role,
      status,
      isVerified: data.isVerified === true,
      plan: plans.get(document.id) ?? "free",
      school: String(data.school ?? ""),
      createdAt: date(data.createdAt),
    };
  });
}

export async function getAdminContent(
  actor: AdminActor,
): Promise<AdminContentRow[]> {
  assertAdmin(actor);
  const db = adminDb();
  const [posts, resources, threads] = await Promise.all([
    db.collection("posts").orderBy("createdAt", "desc").limit(20).get(),
    db.collection("resources").orderBy("createdAt", "desc").limit(20).get(),
    db.collection("forumThreads").orderBy("createdAt", "desc").limit(20).get(),
  ]);
  return [
    ...posts.docs
      .filter((document) => document.data().type !== "activity")
      .map((document): AdminContentRow => {
        const data = document.data();
        return {
          id: document.id,
          type: "post",
          title: String(data.content ?? "Post").slice(0, 120),
          ownerId: String(data.authorId ?? ""),
          moderationStatus: moderationStatus(data.moderationStatus),
          reportCount: count(data.reportCount),
          createdAt: date(data.createdAt),
        };
      }),
    ...resources.docs.map((document): AdminContentRow => {
      const data = document.data();
      return {
        id: document.id,
        type: "resource",
        title: String(data.title ?? "Resource"),
        ownerId: String(data.authorId ?? ""),
        moderationStatus: moderationStatus(data.moderationStatus),
        reportCount: count(data.reportCount),
        createdAt: date(data.createdAt),
      };
    }),
    ...threads.docs.map((document): AdminContentRow => {
      const data = document.data();
      return {
        id: document.id,
        type: "forumThread",
        title: String(data.title ?? "Discussion"),
        ownerId: String(data.authorId ?? ""),
        moderationStatus: moderationStatus(data.moderationStatus),
        reportCount: count(data.reportCount),
        createdAt: date(data.createdAt),
      };
    }),
  ].sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt)),
  );
}

export async function getAdminReports(
  actor: AdminActor,
): Promise<AdminReportRow[]> {
  assertAdmin(actor);
  const reports = await adminDb()
    .collection("reports")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const db = adminDb();
  const paths = reports.docs.map((document) =>
    reportTargetPath(document.data()),
  );
  const uniquePaths = [
    ...new Set(paths.filter((path): path is string => Boolean(path))),
  ];
  const targets = uniquePaths.length
    ? await db.getAll(...uniquePaths.map((path) => db.doc(path)))
    : [];
  const targetMap = new Map(targets.map((target) => [target.ref.path, target]));
  const extraPaths = new Set<string>();
  for (const target of targets) {
    if (
      target.ref.path.startsWith("posts/") &&
      target.data()?.type === "activity"
    ) {
      const canonical = activityTarget(target.data());
      if (canonical) extraPaths.add(canonical.path);
    }
  }
  for (const document of reports.docs) {
    const data = document.data();
    if (data.targetType === "forumReply" && safeId(data.parentId))
      extraPaths.add(`forumThreads/${data.parentId}`);
  }
  if (extraPaths.size) {
    const extra = await db.getAll(
      ...[...extraPaths].map((path) => db.doc(path)),
    );
    for (const target of extra) targetMap.set(target.ref.path, target);
  }
  return reports.docs.map((document) => {
    const data = document.data();
    const status =
      data.status === "resolved" || data.status === "dismissed"
        ? data.status
        : "open";
    return {
      id: document.id,
      reporterId: String(data.reporterId ?? ""),
      targetType: String(data.targetType ?? "content"),
      targetId: String(data.targetId ?? ""),
      parentId: typeof data.parentId === "string" ? data.parentId : null,
      reason: String(data.reason ?? "other"),
      details: String(data.details ?? data.description ?? ""),
      status,
      createdAt: date(data.createdAt),
      target: reportTargetPreview(data, targetMap),
    };
  });
}

const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,128}$/.test(value);

function reportTargetPath(data: FirebaseFirestore.DocumentData): string | null {
  if (!safeId(data.targetId)) return null;
  switch (data.targetType) {
    case "post":
      return `posts/${data.targetId}`;
    case "resource":
      return `resources/${data.targetId}`;
    case "forumThread":
      return `forumThreads/${data.targetId}`;
    case "forumReply":
      return safeId(data.parentId)
        ? `forumThreads/${data.parentId}/replies/${data.targetId}`
        : null;
    default:
      return null;
  }
}

/** Admin previews contain only the reported community item, never private originals. */
function reportTargetPreview(
  data: FirebaseFirestore.DocumentData,
  targets: Map<string, FirebaseFirestore.DocumentSnapshot>,
): AdminReportTarget | null {
  const path = reportTargetPath(data);
  if (!path) return null;
  let target = targets.get(path);
  if (!target?.exists) return null;
  let type = data.targetType as AdminReportTarget["type"];
  let announcement: AdminReportTarget["announcement"] = null;
  if (type === "post" && target.data()?.type === "activity") {
    const source = activityTarget(target.data());
    const canonical = source && targets.get(source.path);
    const activityAuthor = target.data()?.authorId;
    if (
      !source ||
      !canonical?.exists ||
      typeof activityAuthor !== "string" ||
      !activityAuthor ||
      canonical.data()?.authorId !== activityAuthor
    )
      return null;
    if (
      target.data()?.activityKind === "lesson-published" &&
      canonical.data()?.sourceLessonId !== target.data()?.activityEntityId
    )
      return null;
    announcement = {
      id: target.id,
      moderationStatus: moderationStatus(target.data()?.moderationStatus),
    };
    target = canonical;
    type = source.type;
  }
  if (
    type === "forumReply" &&
    !targets.get(`forumThreads/${data.parentId}`)?.exists
  )
    return null;
  const content = target.data()!;
  return {
    type,
    id: target.id,
    parentId: type === "forumReply" ? data.parentId : null,
    title: String(
      content.title ??
        (type === "forumReply"
          ? "Reported reply"
          : (content.content ?? "Reported post")),
    ).slice(0, 160),
    preview: String(
      type === "resource"
        ? (content.description ?? "")
        : (content.content ?? ""),
    ).slice(0, 2_000),
    moderationStatus: moderationStatus(content.moderationStatus),
    announcement,
  };
}

export async function getAdminVerifications(
  actor: AdminActor,
): Promise<AdminVerificationRow[]> {
  assertAdmin(actor);
  const requests = await adminDb()
    .collection("verificationRequests")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return requests.docs.map((document) => {
    const data = document.data();
    const status =
      data.status === "approved" || data.status === "rejected"
        ? data.status
        : "pending";
    return {
      id: document.id,
      uid: String(data.uid ?? ""),
      evidencePath:
        typeof data.evidencePath === "string" ? data.evidencePath : null,
      status,
      reason: typeof data.reason === "string" ? data.reason : null,
      createdAt: date(data.createdAt),
    };
  });
}

function contentPath(
  action: Extract<AdminAction, { action: "content.moderate" }>,
): string {
  switch (action.targetType) {
    case "post":
      return `posts/${action.targetId}`;
    case "resource":
      return `resources/${action.targetId}`;
    case "forumThread":
      return `forumThreads/${action.targetId}`;
    case "forumReply":
      if (!action.parentId) throw new AdminActionError("invalid-target");
      return `forumThreads/${action.parentId}/replies/${action.targetId}`;
  }
}

export async function performAdminAction(
  actor: AdminActor,
  action: AdminAction,
): Promise<void> {
  assertAdmin(actor);
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const auditRef = db.collection("auditLogs").doc();
    let targetType = "";
    let targetId = action.targetId;
    let requestedTarget: Record<string, unknown> = {};
    let previousState: Record<string, unknown> = {};
    let newState: Record<string, unknown> = {};

    if (action.action === "user.status") {
      const reference = db.doc(`users/${action.targetId}`);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new AdminActionError("not-found");
      if (
        action.targetId === actor.uid ||
        snapshot.data()?.role === "platform_admin"
      ) {
        throw new AdminActionError("protected-target");
      }
      previousState = { status: String(snapshot.data()?.status ?? "active") };
      newState = { status: action.status };
      transaction.update(reference, {
        status: action.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      targetType = "user";
    } else if (action.action === "content.moderate") {
      let reference = db.doc(contentPath(action));
      let snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new AdminActionError("not-found");
      let requestedActivity: FirebaseFirestore.DocumentSnapshot | null = null;
      targetType = action.targetType;
      if (
        action.targetType === "post" &&
        snapshot.data()?.type === "activity"
      ) {
        const source = activityTarget(snapshot.data());
        if (!source) throw new AdminActionError("invalid-target");
        requestedActivity = snapshot;
        reference = db.doc(source.path);
        snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new AdminActionError("not-found");
        const activityAuthor = requestedActivity.data()?.authorId;
        if (
          typeof activityAuthor !== "string" ||
          !activityAuthor ||
          snapshot.data()?.authorId !== activityAuthor ||
          (requestedActivity.data()?.activityKind === "lesson-published" &&
            snapshot.data()?.sourceLessonId !==
              requestedActivity.data()?.activityEntityId)
        )
          throw new AdminActionError("invalid-target");
        targetType = source.type;
        targetId = source.id;
        requestedTarget = {
          requestedTargetType: "post",
          requestedTargetId: action.targetId,
          sourceActivityId: action.targetId,
        };
      }
      if (action.targetType === "forumReply") {
        const parent = await transaction.get(
          db.doc(`forumThreads/${action.parentId}`),
        );
        if (!parent.exists) throw new AdminActionError("not-found");
        requestedTarget = { parentId: action.parentId };
      }
      previousState = {
        moderationStatus: String(
          snapshot.data()?.moderationStatus ?? "pending",
        ),
        ...(requestedActivity
          ? {
              activityModerationStatus: moderationStatus(
                requestedActivity.data()?.moderationStatus,
              ),
            }
          : {}),
      };
      newState = {
        moderationStatus: action.status,
        ...(requestedActivity
          ? { activityModerationStatus: action.status }
          : {}),
      };
      transaction.update(reference, {
        moderationStatus: action.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (requestedActivity)
        transaction.update(requestedActivity.ref, {
          moderationStatus: action.status,
          updatedAt: FieldValue.serverTimestamp(),
        });
    } else if (action.action === "report.resolve") {
      const reference = db.doc(`reports/${action.targetId}`);
      const statsRef = db.doc("platformStats/current");
      const [snapshot, stats] = await transaction.getAll(reference, statsRef);
      if (!snapshot.exists) throw new AdminActionError("not-found");
      const currentStatus = String(snapshot.data()?.status ?? "open");
      if (currentStatus !== "open" && currentStatus !== "pending")
        throw new AdminActionError("conflict");
      previousState = { status: currentStatus };
      newState = { status: action.resolution };
      transaction.update(reference, {
        status: action.resolution,
        resolution: action.reason,
        assignedAdminId: actor.uid,
        resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        statsRef,
        {
          pendingReports: Math.max(0, count(stats.data()?.pendingReports) - 1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      targetType = "report";
    } else {
      const requestRef = db.doc(`verificationRequests/${action.targetId}`);
      const statsRef = db.doc("platformStats/current");
      const [requestSnapshot, stats] = await transaction.getAll(
        requestRef,
        statsRef,
      );
      if (!requestSnapshot.exists) throw new AdminActionError("not-found");
      if (requestSnapshot.data()?.status !== "pending")
        throw new AdminActionError("conflict");
      const uid = String(requestSnapshot.data()?.uid ?? "");
      if (!uid) throw new AdminActionError("invalid-target");
      const userRef = db.doc(`users/${uid}`);
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) throw new AdminActionError("not-found");
      previousState = {
        status: "pending",
        isVerified: userSnapshot.data()?.isVerified === true,
      };
      newState = {
        status: action.decision,
        isVerified: action.decision === "approved",
      };
      transaction.update(requestRef, {
        status: action.decision,
        reviewerId: actor.uid,
        reason: action.reason,
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, {
        isVerified: action.decision === "approved",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        statsRef,
        {
          pendingVerifications: Math.max(
            0,
            count(stats.data()?.pendingVerifications) - 1,
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      targetType = "verificationRequest";
    }

    transaction.create(auditRef, {
      actorId: actor.uid,
      action: action.action,
      targetType,
      targetId,
      ...requestedTarget,
      previousState,
      newState,
      reason: action.reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}
