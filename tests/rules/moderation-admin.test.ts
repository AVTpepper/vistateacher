// @vitest-environment node
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  getAdminContent,
  getAdminOverview,
  getAdminReports,
  performAdminAction,
} from "@/lib/admin/server";
import { reportPublicContent } from "@/lib/community/reporting";
import { adminDb } from "@/lib/firebase/admin";
import { getPost, reportPost } from "@/lib/feed/server";
import { reportForumContent } from "@/lib/forum/server";

const admin = { uid: "review-admin", role: "platform_admin" as const };
const owner = "review-owner";
const peer = "review-peer";
const resourceId = "reported-resource";
const activityId = "resource-announcement";
const details = {
  reason: "unsafe" as const,
  details: "Review this classroom material.",
};
const stamp = Timestamp.fromMillis(Date.UTC(2026, 10, 1));
let environment: RulesTestEnvironment | undefined;

const resource = () => adminDb().doc(`resources/${resourceId}`);
const activity = () => adminDb().doc(`posts/${activityId}`);
const stats = () => adminDb().doc("platformStats/current");
const decision = (
  targetType: "post" | "resource" | "forumThread" | "forumReply",
  targetId: string,
  status: "approved" | "rejected" = "rejected",
  parentId: string | null = null,
) => ({
  action: "content.moderate" as const,
  targetType,
  targetId,
  parentId,
  status,
  reason: "Administrator reviewed the reported material.",
});

beforeAll(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher"
  )
    throw new Error(
      "Moderation integration requires the isolated demo Firestore emulator.",
    );
  environment = await initializeTestEnvironment({
    projectId: "demo-vista-teacher",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  const batch = adminDb().batch();
  batch.set(adminDb().doc(`users/${owner}`), {
    status: "active",
    resourceCount: 1,
  });
  batch.set(adminDb().doc(`users/${peer}`), { status: "active" });
  batch.set(adminDb().doc(`users/${admin.uid}`), {
    status: "active",
    role: admin.role,
  });
  batch.set(stats(), { pendingReports: 0 });
  batch.set(resource(), {
    authorId: owner,
    title: "Reported classroom resource",
    description: "A public resource description.",
    type: "worksheet",
    status: "active",
    moderationStatus: "approved",
    reportCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
  });
  batch.set(activity(), {
    authorId: owner,
    type: "activity",
    activityKind: "resource-published",
    activityEntityId: resourceId,
    activityTitle: "Reported classroom resource",
    activityLabel: "Published a resource",
    activityHref: `/resources/${resourceId}`,
    moderationStatus: "approved",
    createdAt: stamp,
    updatedAt: stamp,
  });
  await batch.commit();
});
afterEach(async () => {
  await environment?.clearFirestore();
});
afterAll(async () => {
  await environment?.cleanup();
});

describe("canonical reports and administrator decisions", () => {
  it("deduplicates activity and detail reports against one canonical resource", async () => {
    await reportPost(peer, { postId: activityId, ...details });
    await expect(
      reportPublicContent(peer, "resource", resourceId, details),
    ).rejects.toMatchObject({ code: "already-reported" });
    const reports = await adminDb().collection("reports").get();
    expect(reports.size).toBe(1);
    expect(reports.docs[0].data()).toMatchObject({
      targetType: "resource",
      targetId: resourceId,
      targetOwnerId: owner,
      sourceActivityId: activityId,
      status: "open",
    });
    expect((await resource().get()).data()?.reportCount).toBe(1);
    expect((await stats().get()).data()?.pendingReports).toBe(1);
  });

  it("uses the existing forum-thread report identity from either announcement or thread", async () => {
    const threadId = "reported-thread";
    await adminDb().doc(`forumThreads/${threadId}`).set({
      authorId: owner,
      title: "Reported discussion",
      moderationStatus: "approved",
      reportCount: 0,
    });
    await activity().update({
      activityKind: "forum-thread",
      activityEntityId: threadId,
    });
    await reportPost(peer, { postId: activityId, ...details });
    await expect(
      reportForumContent(peer, { threadId, replyId: null, ...details }),
    ).rejects.toMatchObject({ code: "already-reported" });
    expect(
      (await adminDb().doc(`reports/forumThread_${threadId}_${peer}`).get())
        .exists,
    ).toBe(true);
    expect((await stats().get()).data()?.pendingReports).toBe(1);
  });

  it("denies self-reports and reports through a stale hidden announcement without side effects", async () => {
    await expect(
      reportPublicContent(owner, "resource", resourceId, details),
    ).rejects.toMatchObject({ code: "not-found" });
    await resource().update({ moderationStatus: "rejected" });
    await expect(
      reportPost(peer, { postId: activityId, ...details }),
    ).rejects.toMatchObject({ code: "not-found" });
    expect((await adminDb().collection("reports").get()).empty).toBe(true);
    expect((await resource().get()).data()?.reportCount).toBe(0);
    expect((await stats().get()).data()?.pendingReports).toBe(0);
  });

  it("audits canonical resource rejection when an administrator acts on an announcement", async () => {
    await performAdminAction(admin, decision("post", activityId));
    expect((await resource().get()).data()?.moderationStatus).toBe("rejected");
    expect((await activity().get()).data()?.moderationStatus).toBe("rejected");
    expect(
      (await adminDb().doc(`users/${owner}`).get()).data()?.resourceCount,
    ).toBe(1);
    const logs = await adminDb().collection("auditLogs").get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0].data()).toMatchObject({
      targetType: "resource",
      targetId: resourceId,
      requestedTargetType: "post",
      requestedTargetId: activityId,
      sourceActivityId: activityId,
    });
    expect(await getPost(peer, activityId)).toBeNull();
  });

  it("keeps legacy announcement rejection independent until explicitly approved", async () => {
    await activity().update({ moderationStatus: "rejected" });
    await performAdminAction(
      admin,
      decision("resource", resourceId, "approved"),
    );
    expect(await getPost(peer, activityId)).toBeNull();
    await performAdminAction(admin, decision("post", activityId, "approved"));
    expect((await getPost(peer, activityId))?.id).toBe(activityId);
  });

  it("previews and moderates an old hidden reported target outside the latest content page", async () => {
    await resource().update({ moderationStatus: "rejected" });
    const batch = adminDb().batch();
    for (let index = 0; index < 21; index++)
      batch.set(adminDb().doc(`resources/new-${index}`), {
        title: `New resource ${index}`,
        status: "active",
        moderationStatus: "approved",
        createdAt: Timestamp.fromMillis(stamp.toMillis() + index + 1),
      });
    batch.set(adminDb().doc("reports/old-report"), {
      reporterId: peer,
      targetType: "resource",
      targetId: resourceId,
      reason: details.reason,
      details: details.details,
      status: "open",
      createdAt: stamp,
    });
    await batch.commit();
    expect(
      (await getAdminContent(admin)).some((item) => item.id === resourceId),
    ).toBe(false);
    const [report] = await getAdminReports(admin);
    expect((await getAdminOverview(admin)).totals.pendingReports).toBe(1);
    expect(report.target).toMatchObject({
      type: "resource",
      id: resourceId,
      title: "Reported classroom resource",
      preview: "A public resource description.",
      moderationStatus: "rejected",
    });
    await performAdminAction(
      admin,
      decision("resource", report.target!.id, "approved"),
    );
    expect((await resource().get()).data()?.moderationStatus).toBe("approved");
    expect(
      (await adminDb().doc("reports/old-report").get()).data()?.status,
    ).toBe("open");
  });

  it("resolves an orphan legacy activity report without recreating the removed source", async () => {
    await resource().delete();
    await adminDb().doc("reports/orphan-report").set({
      targetType: "post",
      targetId: activityId,
      reporterId: peer,
      reason: "unsafe",
      details: "Legacy report.",
      status: "open",
      createdAt: stamp,
    });
    await stats().update({ pendingReports: FieldValue.increment(1) });
    expect((await getAdminReports(admin))[0].target).toBeNull();
    await performAdminAction(admin, {
      action: "report.resolve",
      targetId: "orphan-report",
      resolution: "resolved",
      reason: "Source content has already been removed.",
    });
    expect((await resource().get()).exists).toBe(false);
    expect(
      (await adminDb().doc("reports/orphan-report").get()).data()?.status,
    ).toBe("resolved");
    expect((await stats().get()).data()?.pendingReports).toBe(0);
  });

  it("resolves a report once under concurrent administrator retries", async () => {
    await reportPublicContent(peer, "resource", resourceId, details);
    const action = {
      action: "report.resolve" as const,
      targetId: `resource_${resourceId}_${peer}`,
      resolution: "resolved" as const,
      reason: "Review completed after a separate content decision.",
    };
    const results = await Promise.allSettled([
      performAdminAction(admin, action),
      performAdminAction(admin, action),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await stats().get()).data()?.pendingReports).toBe(0);
    expect((await resource().get()).data()?.moderationStatus).toBe("approved");
    expect(
      (
        await adminDb()
          .collection("auditLogs")
          .where("action", "==", "report.resolve")
          .get()
      ).size,
    ).toBe(1);
  });
});
