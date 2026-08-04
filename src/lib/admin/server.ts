import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
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
  return value === "pending" || value === "rejected" ? value : "approved";
}

export async function getAdminOverview(
  actor: AdminActor,
): Promise<AdminOverview> {
  assertAdmin(actor);
  const db = adminDb();
  const [stats, audits] = await Promise.all([
    db.doc("platformStats/current").get(),
    db.collection("auditLogs").orderBy("createdAt", "desc").limit(12).get(),
  ]);
  const data = stats.data() ?? {};
  return {
    totals: {
      users: count(data.totalUsers),
      plusSubscribers: count(data.plusSubscribers),
      posts: count(data.posts),
      resources: count(data.resources),
      forumThreads: count(data.forumThreads),
      pendingReports: count(data.pendingReports),
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
    ...posts.docs.map((document): AdminContentRow => {
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
    };
  });
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
    const targetId = action.targetId;
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
      const reference = db.doc(contentPath(action));
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new AdminActionError("not-found");
      previousState = {
        moderationStatus: String(
          snapshot.data()?.moderationStatus ?? "pending",
        ),
      };
      newState = { moderationStatus: action.status };
      transaction.update(reference, {
        moderationStatus: action.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      targetType = action.targetType;
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
      previousState,
      newState,
      reason: action.reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}
