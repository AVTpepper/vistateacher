import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import {
  createWorksheet,
  getWorksheet,
  getWorksheetWorkspace,
  updateWorksheet,
  deleteWorksheet,
  regenerateWorksheet,
  restoreWorksheetVersion,
} from "@/lib/worksheets/server";
import { createWorksheetExport } from "@/lib/worksheets/export";
import * as worksheetProvider from "@/lib/worksheets/provider";
import { createMockWorksheet } from "@/lib/worksheets/mock-provider";
import { worksheetSourceSchema } from "@/schemas/worksheet";

import {
  acceptConnectionRequest,
  discoverEducators,
  getNetworkList,
  followEducator,
  NetworkActionError,
  resolveConnectionRelationship,
  unfollowEducator,
} from "@/lib/network/server";
import {
  addPostComment,
  createPost,
  deletePost,
  FeedActionError,
  getFeedPage,
  recordPostShare,
  setPostBookmarked,
  setPostLiked,
} from "@/lib/feed/server";
import {
  downloadResource,
  finalizeResourceUpload,
  listIncompleteResources,
  reserveResourceUpload,
  reviewResource,
  ResourceActionError,
  updateResource,
} from "@/lib/resources/server";
import {
  acceptForumReply,
  addForumReply,
  createForumThread,
  ForumActionError,
  getForumThread,
  moderateForumThread,
  reportForumContent,
  setForumLiked,
  updateForumReply,
  updateForumThread,
} from "@/lib/forum/server";
import {
  editMessage,
  MessageActionError,
  reportMessage,
  sendMessage,
  setUserBlocked,
  startConversation,
  getNotifications,
  getUnreadNotificationCount,
  updateNotification,
} from "@/lib/messages/server";
import {
  createLesson,
  deleteLesson,
  duplicateLesson,
  getSharedLesson,
  getLessonWorkspace,
  LessonActionError,
  regenerateLesson,
  updateLesson,
} from "@/lib/lessons/server";
import { createLessonExport } from "@/lib/lessons/export";
import {
  BillingError,
  reconcileBillingEvent,
  startVistaTrial,
} from "@/lib/billing/server";
import { AdminActionError, performAdminAction } from "@/lib/admin/server";
import { getProfileView, getProfileViewers } from "@/lib/profiles/server";
import { getDashboardData } from "@/lib/dashboard/server";
import {
  createTeachingExport,
  getTeachingExportBytes,
  getTeachingExport,
  claimTeachingExport,
  mutateTeachingExport,
  publishTeachingExport,
} from "@/lib/teaching-exports/server";
import {
  reserveGeneratedResource,
  saveGeneratedResourceBytes,
} from "@/lib/resources/server";
import { createHash } from "node:crypto";
import { adminStorage } from "@/lib/firebase/admin";
import { adminAuth } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  enqueueAccountDeletion,
  processAccountDeletion,
} from "@/lib/accounts/deletion";
const projectId = "demo-vista-teacher";
const storageBucketUrl = `gs://${projectId}.appspot.com`;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile("firestore.rules", "utf8") },
    storage: { rules: await readFile("storage.rules", "utf8") },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

it("keeps Google snapshots private, publishes immutable server bytes once and preserves the copy after source deletion", async () => {
  const db = adminDb();
  await db
    .doc("users/export-owner")
    .set({ status: "active", displayName: "Export Teacher", resourceCount: 0 });
  await db
    .doc("users/export-peer")
    .set({ status: "active", displayName: "Peer" });
  const content = createMockWorksheet(worksheetBrief);
  await db.doc("worksheets/export-source").set({
    ownerId: "export-owner",
    source: { ...worksheetBrief, studentNeeds: "PRIVATE BRIEF" },
    content,
    currentVersion: 1,
  });
  const input = {
    kind: "worksheet" as const,
    sourceId: "export-source",
    version: 1,
    mode: "student" as const,
    destination: {
      id: "drive-owner",
      email: "teacher@example.com",
      name: "Teacher",
    },
  };
  const [first, retry] = await Promise.all([
    createTeachingExport("export-owner", input),
    createTeachingExport("export-owner", input),
  ]);
  expect(first.id).toBe(retry.id);
  const ownerDb = testEnv.authenticatedContext("export-owner").firestore();
  const peerDb = testEnv.authenticatedContext("export-peer").firestore();
  for (const client of [ownerDb, peerDb]) {
    await assertFails(
      getDoc(doc(client, `users/export-owner/teachingExports/${first.id}`)),
    );
    await assertFails(
      setDoc(doc(client, `users/export-owner/teachingExports/${first.id}`), {
        state: "complete",
      }),
    );
  }
  await expect(
    getTeachingExportBytes("export-peer", first.id),
  ).rejects.toMatchObject({ code: "not-found" });
  const snapshot = await getTeachingExportBytes("export-owner", first.id);
  expect(snapshot.bytes.subarray(0, 2).toString()).toBe("PK");
  expect(createHash("sha256").update(snapshot.bytes).digest("hex")).toBe(
    first.binaryHash,
  );
  await db
    .doc("worksheets/export-source")
    .update({ currentVersion: 2, "content.title": "Newer teacher edit" });
  expect((await createTeachingExport("export-owner", input)).title).toBe(
    first.title,
  );
  expect(
    (await getTeachingExportBytes("export-owner", first.id)).bytes,
  ).toEqual(snapshot.bytes);
  const claimed = await claimTeachingExport("export-owner", first.id);
  await expect(
    claimTeachingExport("export-owner", first.id),
  ).rejects.toMatchObject({ code: "busy" });
  await mutateTeachingExport("export-owner", first.id, {
    action: "session",
    claim: claimed.claim!,
    uri: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=rules-test",
  });
  await mutateTeachingExport("export-owner", first.id, {
    action: "complete",
    claim: claimed.claim!,
    document: {
      id: "private-doc",
      title: first.title,
      url: "https://docs.google.com/document/d/private-doc/edit",
    },
  });
  const publish = { publicationId: randomUUID(), metadata: first.defaults };
  // Emulate a stopped worker after the reviewed details were persisted. Firestore
  // returns map keys in its own order; equivalent metadata must still resume.
  await db.doc(`users/export-owner/teachingExports/${first.id}`).update({
    publication: {
      publicationId: publish.publicationId,
      metadata: publish.metadata,
      resourceId: null,
      state: "pending",
      claim: null,
      leaseUntil: null,
    },
  });
  const published = await publishTeachingExport(
    "export-owner",
    first.id,
    publish,
  );
  expect(
    await publishTeachingExport("export-owner", first.id, publish),
  ).toEqual(published);
  const resource = await db.doc(`resources/${published.resourceId}`).get();
  const [stored] = await adminStorage()
    .bucket()
    .file(resource.data()!.filePath)
    .download();
  expect(stored).toEqual(snapshot.bytes);
  expect(resource.data()?.status).toBe("active");
  expect(JSON.stringify(resource.data())).not.toMatch(
    /drive-owner|teacher@example|private-doc|PRIVATE BRIEF|rules-test/,
  );
  expect((await db.doc("users/export-owner").get()).data()?.resourceCount).toBe(
    1,
  );
  const usage = await db
    .collection("usage")
    .where("uid", "==", "export-owner")
    .get();
  expect(usage.docs[0].data().resourceUploads).toBe(1);
  await deleteWorksheet("export-owner", "export-source");
  expect(
    (await db.doc(`users/export-owner/teachingExports/${first.id}`).get())
      .exists,
  ).toBe(false);
  expect(
    (await db.doc(`resources/${published.resourceId}`).get()).data()?.status,
  ).toBe("active");
  expect(
    (await db.doc("users/export-owner/exportState/limits").get()).data()
      ?.snapshots,
  ).toBe(0);
  await expect(
    getTeachingExport("export-owner", first.id),
  ).rejects.toMatchObject({ code: "not-found" });
});

it("denies client replacement and public finalization of server-generated community files", async () => {
  await adminDb()
    .doc("users/generated-owner")
    .set({ status: "active", resourceCount: 0 });
  const bytes = Buffer.from("immutable reserved DOCX bytes");
  const reservation = await reserveGeneratedResource("generated-owner", {
    publicationId: "immutable-rules-intent",
    bytesHash: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    metadata: {
      title: "Frozen worksheet",
      description: "A reviewed student worksheet.",
      type: "worksheet",
      subject: "Science",
      gradeLevel: "Grade 6",
      tags: [],
      accessTier: "free",
    },
  });
  const client = testEnv.authenticatedContext("generated-owner");
  await assertFails(
    uploadBytes(
      ref(client.storage(storageBucketUrl), reservation.uploadPath),
      bytes,
      {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ),
  );
  await saveGeneratedResourceBytes(
    "generated-owner",
    reservation.resourceId,
    bytes,
  );
  await assertFails(
    uploadBytes(
      ref(client.storage(storageBucketUrl), reservation.uploadPath),
      Buffer.alloc(bytes.length, 65),
      {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ),
  );
  await expect(
    finalizeResourceUpload("generated-owner", reservation.resourceId),
  ).rejects.toMatchObject({ code: "not-ready" });
});

it("defers account cleanup for pending export writes, then removes worksheets and private export records", async () => {
  const uid = `export-deletion-${randomUUID()}`;
  const db = adminDb();
  await adminAuth().createUser({
    uid,
    email: `${uid}@vista.local`,
    emailVerified: true,
  });
  await db
    .doc(`users/${uid}`)
    .set({ status: "active", displayName: "Teacher" });
  await db.doc(`userPrivate/${uid}`).set({ email: `${uid}@vista.local` });
  await db
    .doc(`worksheets/${uid}`)
    .set({ ownerId: uid, title: "Private worksheet" });
  await db
    .doc(`worksheets/${uid}/versions/v1`)
    .set({ content: "Private history" });
  await db
    .doc(`users/${uid}/teachingExports/snapshot`)
    .set({ bytes: Buffer.from("Private export") });
  const receiptRef = db.doc(`users/${uid}/generatedResourcePublications/write`);
  await receiptRef.set({
    writeUntil: Timestamp.fromMillis(Date.now() + 60_000),
  });
  await enqueueAccountDeletion(uid);
  expect(await processAccountDeletion(uid)).toBe("pending");
  expect((await db.doc(`users/${uid}`).get()).data()?.status).toBe("deleted");
  expect((await db.doc(`worksheets/${uid}`).get()).exists).toBe(true);
  expect((await receiptRef.get()).exists).toBe(true);
  expect(await processAccountDeletion(uid)).toBe("pending");
  // Simulate the bounded grace elapsing without sleeping or external calls.
  await receiptRef.update({ writeUntil: Timestamp.fromMillis(Date.now() - 1) });
  await db
    .doc(`accountDeletions/${uid}`)
    .update({ retryAfter: Timestamp.fromMillis(Date.now() - 1) });
  expect(await processAccountDeletion(uid)).toBe("complete");
  for (const path of [
    `users/${uid}`,
    `worksheets/${uid}`,
    `worksheets/${uid}/versions/v1`,
    `users/${uid}/teachingExports/snapshot`,
    receiptRef.path,
  ])
    expect((await db.doc(path).get()).exists).toBe(false);
  await expect(adminAuth().getUser(uid)).rejects.toMatchObject({
    code: "auth/user-not-found",
  });
});

const worksheetBrief = worksheetSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Local food webs",
  difficulty: "core",
  language: "English",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 1,
    matching: 1,
    fillInBlank: 1,
    trueFalse: 1,
  },
});
const lessonBrief = {
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Local food webs",
  durationMinutes: 50,
  objectives: "",
  standards: "",
  studentNeeds: "",
  teachingStyle: "inquiry" as const,
};
const worksheetUsageRef = (uid: string) =>
  adminDb().doc(`usage/${uid}_${new Date().toISOString().slice(0, 7)}`);

describe("Notification delivery and complete inbox state", () => {
  it("counts legacy and older unread rows, filters before pagination, and scopes mutations to the owner", async () => {
    await seedNetworkUser("inbox-owner");
    await seedNetworkUser("inbox-outsider");
    const db = adminDb();
    const batch = db.batch();
    for (let index = 0; index < 195; index++)
      batch.set(db.doc(`users/inbox-owner/notifications/item-${index}`), {
        read: index >= 160,
        ...(index < 125
          ? index % 2
            ? { archived: false }
            : {}
          : { archived: index < 160 }),
        createdAt: new Date(Date.now() - 300_000 + index * 1000),
        message: `Update ${index}`,
        href: "/app",
        type: "post-comment",
      });
    await batch.commit();
    expect(await getUnreadNotificationCount("inbox-owner")).toBe(125);
    const first = await getNotifications("inbox-owner");
    expect(first.notifications.every((item) => item.read)).toBe(true);
    expect(first.unreadCount).toBe(125);
    const unread = await getNotifications("inbox-owner", undefined, "unread");
    expect(unread.notifications).toHaveLength(30);
    expect(
      unread.notifications.every((item) => !item.read && !item.archived),
    ).toBe(true);
    const next = await getNotifications(
      "inbox-owner",
      unread.nextCursor!,
      "unread",
    );
    expect(next.notifications).toHaveLength(30);
    expect(
      next.notifications.some((item) =>
        unread.notifications.some((first) => first.id === item.id),
      ),
    ).toBe(false);
    expect(next.unreadCount).toBe(125);
    expect(
      (
        await getNotifications("inbox-owner", undefined, "archived")
      ).notifications.every((item) => item.archived),
    ).toBe(true);
    await updateNotification("inbox-owner", "item-0", "archive");
    await updateNotification("inbox-owner", "item-0", "archive");
    expect(await getUnreadNotificationCount("inbox-owner")).toBe(124);
    await updateNotification("inbox-owner", "item-0", "restore");
    expect(await getUnreadNotificationCount("inbox-owner")).toBe(125);
    await Promise.all([
      updateNotification("inbox-owner", "item-0", "mark-read"),
      updateNotification("inbox-owner", "item-0", "archive"),
    ]);
    expect(await getUnreadNotificationCount("inbox-owner")).toBe(124);
    expect(
      (await db.doc("users/inbox-owner/notifications/item-0").get()).data(),
    ).toMatchObject({ read: true, archived: true });
    await expect(
      updateNotification("inbox-outsider", "item-0", "delete"),
    ).rejects.toMatchObject({ code: "not-found" });
    expect(await getUnreadNotificationCount("inbox-outsider")).toBe(0);
  });

  it("marks more than one batch while preserving archive history and updates after the action cutoff", async () => {
    const db = adminDb();
    const batch = db.batch();
    for (let index = 0; index < 408; index++)
      batch.set(db.doc(`users/bulk-owner/notifications/item-${index}`), {
        read: false,
        archived: index >= 405,
        createdAt: new Date(Date.now() - 60_000 + index),
      });
    batch.set(db.doc("users/bulk-owner/notifications/future"), {
      read: false,
      archived: false,
      createdAt: new Date(Date.now() + 60_000),
    });
    await batch.commit();
    await updateNotification("bulk-owner", null, "mark-read");
    expect(await getUnreadNotificationCount("bulk-owner")).toBe(1);
    const remaining = await db
      .collection("users/bulk-owner/notifications")
      .where("read", "==", false)
      .get();
    expect(remaining.size).toBe(4);
    expect(
      remaining.docs.every(
        (item) => item.id === "future" || item.data().archived === true,
      ),
    ).toBe(true);
  });

  it("honors future in-app preferences for feed, mentions, connections, and messages without blocking the domain action", async () => {
    await seedNetworkUser("quiet-owner");
    await seedNetworkUser("active-peer");
    const db = adminDb();
    await db
      .doc("userPrivate/quiet-owner")
      .set(
        { notificationSettings: { email: true, inApp: false } },
        { merge: true },
      );
    await db
      .doc("users/quiet-owner/notifications/history")
      .set({ read: false, archived: false, createdAt: new Date() });
    const postId = await createPost("quiet-owner", {
      type: "post",
      content: "Discuss a teaching idea",
      tags: [],
      imageURLs: [],
      fileAttachments: [],
      linkURLs: [],
      resourceId: null,
    });
    await setPostLiked("active-peer", postId, true);
    await addPostComment("active-peer", {
      postId,
      content: "Thanks @quiet-owner",
      mentionUids: ["quiet-owner"],
    });
    await followEducator("active-peer", "quiet-owner");
    const conversation = await startConversation("active-peer", {
      recipientId: "quiet-owner",
      content: "A useful teaching conversation",
    });
    expect(
      (await db.collection("users/quiet-owner/notifications").get()).docs.map(
        (item) => item.id,
      ),
    ).toEqual(["history"]);
    expect((await db.doc(`posts/${postId}`).get()).data()).toMatchObject({
      likeCount: 1,
      commentCount: 1,
    });
    expect(
      (
        await db
          .collection(`conversations/${conversation.conversationId}/messages`)
          .get()
      ).size,
    ).toBe(1);
    await db
      .doc("userPrivate/quiet-owner")
      .update({ "notificationSettings.inApp": true });
    await addPostComment("active-peer", {
      postId,
      content: "A new comment for @quiet-owner after opting in",
      mentionUids: ["quiet-owner"],
    });
    expect(
      (await db.collection("users/quiet-owner/notifications").get()).size,
    ).toBe(2);
    expect(
      (
        await db
          .collection("users/quiet-owner/notifications")
          .where("type", "==", "post-comment")
          .get()
      ).empty,
    ).toBe(true);
    await db
      .doc("blocks/quiet-owner_active-peer")
      .set({ blockerId: "quiet-owner", blockedId: "active-peer" });
    await addPostComment("active-peer", {
      postId,
      content: "A public comment without an alert",
      mentionUids: [],
    });
    expect(
      (await db.collection("users/quiet-owner/notifications").get()).size,
    ).toBe(2);
  });
});

describe("Worksheet persistence and access", () => {
  it("protects private worksheets and history in rules and every server mutation/export", async () => {
    await seedNetworkUser("worksheet-owner");
    await seedNetworkUser("worksheet-outsider");
    const created = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      randomUUID(),
    );
    const owner = testEnv.authenticatedContext("worksheet-owner").firestore();
    const outsider = testEnv
      .authenticatedContext("worksheet-outsider")
      .firestore();
    await assertSucceeds(getDoc(doc(owner, "worksheets", created.id)));
    await assertSucceeds(
      getDoc(doc(owner, "worksheets", created.id, "versions", "v1")),
    );
    await assertFails(getDoc(doc(outsider, "worksheets", created.id)));
    await assertFails(
      getDoc(doc(outsider, "worksheets", created.id, "versions", "v1")),
    );
    await assertFails(
      updateDoc(doc(owner, "worksheets", created.id), { currentVersion: 99 }),
    );
    await assertFails(
      setDoc(doc(owner, "worksheets", created.id, "versions", "v99"), {
        content: created.content,
      }),
    );
    for (const action of [
      () => getWorksheet("worksheet-outsider", created.id),
      () =>
        updateWorksheet("worksheet-outsider", created.id, created.content, 1),
      () =>
        regenerateWorksheet("worksheet-outsider", created.id, 1, randomUUID()),
      () =>
        createWorksheetExport("worksheet-outsider", created.id, "docx", "key"),
      () => deleteWorksheet("worksheet-outsider", created.id),
    ])
      await expect(action()).rejects.toMatchObject({ code: "not-found" });
    expect(
      (await getWorksheetWorkspace("worksheet-outsider")).worksheets,
    ).toEqual([]);
    await adminDb()
      .doc("users/worksheet-owner")
      .update({ status: "suspended" });
    await expect(
      createWorksheetExport("worksheet-owner", created.id, "docx", "student"),
    ).rejects.toMatchObject({ code: "inactive" });
  });
  it("replays generation requests without charging again and rejects changed request payloads", async () => {
    await seedNetworkUser("worksheet-owner");
    const requestId = randomUUID();
    const first = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      requestId,
    );
    const replay = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      requestId,
    );
    expect(replay.id).toBe(first.id);
    expect(replay.currentVersion).toBe(1);
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(1);
    await expect(
      createWorksheet(
        "worksheet-owner",
        { ...worksheetBrief, topic: "Another topic" },
        requestId,
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      createLesson("worksheet-owner", lessonBrief),
    ).rejects.toMatchObject({ code: "rate-limited" });
  });
  it("prevents two stale edits from overwriting one another and keeps keys aligned", async () => {
    await seedNetworkUser("worksheet-owner");
    const first = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      randomUUID(),
    );
    const results = await Promise.allSettled([
      updateWorksheet(
        "worksheet-owner",
        first.id,
        { ...first.content, title: "Teacher edit A" },
        1,
      ),
      updateWorksheet(
        "worksheet-owner",
        first.id,
        { ...first.content, title: "Teacher edit B" },
        1,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failure.reason.code).toBe("conflict");
    const current = await getWorksheet("worksheet-owner", first.id);
    expect(current.currentVersion).toBe(2);
    expect(current.versions).toHaveLength(2);
    await expect(
      updateWorksheet(
        "worksheet-owner",
        first.id,
        { ...current.content, answerKey: current.content.answerKey.slice(1) },
        2,
      ),
    ).rejects.toMatchObject({ code: "invalid-content" });
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(1);
    expect(
      (
        await createWorksheetExport(
          "worksheet-owner",
          first.id,
          "docx",
          "student",
        )
      ).fileName,
    ).toContain("student-v2");
    const restored = await restoreWorksheetVersion(
      "worksheet-owner",
      first.id,
      1,
      2,
    );
    expect(restored.currentVersion).toBe(3);
    expect(restored.content).toEqual(first.content);
    expect(restored.versions[0].kind).toBe("restored");
    await expect(
      restoreWorksheetVersion("worksheet-owner", first.id, 1, 2),
    ).rejects.toMatchObject({ code: "conflict" });
    await deleteWorksheet("worksheet-owner", first.id);
    expect(
      (await adminDb().collection(`worksheets/${first.id}/versions`).get())
        .empty,
    ).toBe(true);
  });
  it("shares the quota atomically between simultaneous lesson and worksheet requests", async () => {
    await seedNetworkUser("worksheet-owner");
    await worksheetUsageRef("worksheet-owner").set({
      uid: "worksheet-owner",
      aiLessons: 2,
    });
    const results = await Promise.allSettled([
      createLesson("worksheet-owner", lessonBrief),
      createWorksheet("worksheet-owner", worksheetBrief, randomUUID()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (
        results.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult
      ).reason.code,
    ).toBe("limit-reached");
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(3);
    expect(
      (await getWorksheetWorkspace("worksheet-owner")).usage.remaining,
    ).toBe(0);
  });
  it("refunds failed requests and keeps the last saved version after failed regeneration", async () => {
    await seedNetworkUser("worksheet-owner");
    const provider = vi
      .spyOn(worksheetProvider, "generateWorksheet")
      .mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(
      createWorksheet("worksheet-owner", worksheetBrief, randomUUID()),
    ).rejects.toMatchObject({ code: "generation-failed" });
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(0);
    expect(
      (
        await adminDb()
          .collection("worksheets")
          .where("ownerId", "==", "worksheet-owner")
          .get()
      ).empty,
    ).toBe(true);
    await worksheetUsageRef("worksheet-owner").update({
      lastAiLessonAt: new Date(0),
    });
    const first = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      randomUUID(),
    );
    await worksheetUsageRef("worksheet-owner").update({
      lastAiLessonAt: new Date(0),
    });
    provider.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(
      regenerateWorksheet("worksheet-owner", first.id, 1, randomUUID()),
    ).rejects.toMatchObject({ code: "generation-failed" });
    const current = await getWorksheet("worksheet-owner", first.id);
    expect(current.content).toEqual(first.content);
    expect(current.currentVersion).toBe(1);
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(1);
    expect(
      (await adminDb().doc(`worksheets/${first.id}`).get()).data()
        ?.generationStatus,
    ).toBe("idle");
  });
  it("locks edits and deletion while generation is running", async () => {
    await seedNetworkUser("worksheet-owner");
    const first = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      randomUUID(),
    );
    await worksheetUsageRef("worksheet-owner").update({
      lastAiLessonAt: new Date(0),
    });
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(worksheetProvider, "generateWorksheet").mockImplementationOnce(
      async () => {
        started();
        await gate;
        return createMockWorksheet(worksheetBrief);
      },
    );
    const generation = regenerateWorksheet(
      "worksheet-owner",
      first.id,
      1,
      randomUUID(),
    );
    await ready;
    await expect(
      updateWorksheet("worksheet-owner", first.id, first.content, 1),
    ).rejects.toMatchObject({ code: "busy" });
    await expect(
      deleteWorksheet("worksheet-owner", first.id),
    ).rejects.toMatchObject({ code: "busy" });
    finish();
    expect((await generation).currentVersion).toBe(2);
  });
  it("checks source ownership and keeps the authorized lesson snapshot for regeneration", async () => {
    await seedNetworkUser("worksheet-owner");
    await seedNetworkUser("worksheet-outsider");
    const lesson = await createLesson("worksheet-owner", lessonBrief);
    await expect(
      createWorksheet(
        "worksheet-outsider",
        { ...worksheetBrief, sourceLessonId: lesson.id },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
    await worksheetUsageRef("worksheet-owner").update({
      lastAiLessonAt: new Date(0),
    });
    const first = await createWorksheet(
      "worksheet-owner",
      { ...worksheetBrief, sourceLessonId: lesson.id },
      randomUUID(),
    );
    expect(first.reference).toEqual({
      lessonId: lesson.id,
      title: lesson.title,
      version: 1,
    });
    await deleteLesson("worksheet-owner", lesson.id);
    await worksheetUsageRef("worksheet-owner").update({
      lastAiLessonAt: new Date(0),
    });
    expect(
      (await regenerateWorksheet("worksheet-owner", first.id, 1, randomUUID()))
        .reference,
    ).toEqual(first.reference);
  });
  it("recovers an abandoned creation once across concurrent workspace visits", async () => {
    await seedNetworkUser("worksheet-owner");
    const id = "abandoned-worksheet";
    const jobId = `worksheet-owner_${randomUUID()}`;
    const db = adminDb();
    await worksheetUsageRef("worksheet-owner").set({
      aiLessons: 1,
      aiWorksheetCreations: 1,
    });
    await db.doc(`worksheets/${id}`).set({
      ownerId: "worksheet-owner",
      content: null,
      generationStatus: "generating",
      generationRequestId: jobId,
      updatedAt: new Date(),
    });
    await db.doc(`worksheetGenerationRequests/${jobId}`).set({
      ownerId: "worksheet-owner",
      worksheetId: id,
      status: "pending",
      isNew: true,
      period: new Date().toISOString().slice(0, 7),
      expiresAt: new Date(0),
    });
    await Promise.all([
      getWorksheetWorkspace("worksheet-owner"),
      getWorksheetWorkspace("worksheet-owner"),
    ]);
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(0);
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()
        ?.aiWorksheetCreations,
    ).toBe(0);
    expect((await db.doc(`worksheets/${id}`).get()).exists).toBe(false);
    expect(
      (await db.doc(`worksheetGenerationRequests/${jobId}`).get()).data()
        ?.failure,
    ).toBe("expired");
  });
  it("rejects a late provider response after an expired regeneration was recovered", async () => {
    await seedNetworkUser("worksheet-owner");
    const first = await createWorksheet(
      "worksheet-owner",
      worksheetBrief,
      randomUUID(),
    );
    await worksheetUsageRef("worksheet-owner").update({
      lastAiLessonAt: new Date(0),
    });
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(worksheetProvider, "generateWorksheet").mockImplementationOnce(
      async () => {
        started();
        await gate;
        return {
          ...first.content,
          title: "Late content must not replace the saved worksheet",
        };
      },
    );
    const generation = regenerateWorksheet(
      "worksheet-owner",
      first.id,
      1,
      randomUUID(),
    );
    // Attach a rejection handler before resolving the deferred provider.
    const outcome = generation.then(
      () => "unexpected-success",
      (error) => error.code,
    );
    await ready;
    const jobId = (await adminDb().doc(`worksheets/${first.id}`).get()).data()!
      .generationRequestId;
    await adminDb()
      .doc(`worksheetGenerationRequests/${jobId}`)
      .update({ expiresAt: new Date(0) });
    await getWorksheetWorkspace("worksheet-owner");
    finish();
    expect(await outcome).toBe("conflict");
    const current = await getWorksheet("worksheet-owner", first.id);
    expect(current.currentVersion).toBe(1);
    expect(current.content).toEqual(first.content);
    expect(current.generationStatus).toBe("idle");
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiLessons,
    ).toBe(1);
    expect(
      (await worksheetUsageRef("worksheet-owner").get()).data()?.aiRefinements,
    ).toBe(0);
  });
  it("paginates saved worksheets and rejects another account's cursor", async () => {
    await seedNetworkUser("worksheet-owner");
    await seedNetworkUser("worksheet-outsider");
    const content = createMockWorksheet(worksheetBrief);
    const batch = adminDb().batch();
    for (let index = 0; index < 25; index++)
      batch.set(adminDb().doc(`worksheets/page-${index}`), {
        ownerId: "worksheet-owner",
        source: worksheetBrief,
        content,
        currentVersion: 1,
        updatedAt: new Date(1000 * index),
      });
    await batch.commit();
    const first = await getWorksheetWorkspace("worksheet-owner");
    const second = await getWorksheetWorkspace(
      "worksheet-owner",
      first.nextCursor!,
    );
    expect(first.worksheets).toHaveLength(20);
    expect(second.worksheets).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.worksheets, ...second.worksheets].map((item) => item.id),
      ).size,
    ).toBe(25);
    await expect(
      getWorksheetWorkspace("worksheet-outsider", first.nextCursor!),
    ).rejects.toMatchObject({ code: "invalid-cursor" });
  });
});

afterAll(async () => testEnv.cleanup());

async function seedActiveUser(uid: string, status = "active") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid), {
      uid,
      status,
      role: "educator",
    });
  });
}

async function seedSubscription(uid: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "subscriptions", uid), {
      plan: "free",
      status: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialStartedAt: null,
      trialEndsAt: null,
      trialConsumed: false,
      updatedAt: new Date("2026-08-04T00:00:00.000Z"),
    });
  });
}

async function seedNetworkUser(
  uid: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid), {
      uid,
      displayName: uid,
      gradeLevel: "Middle School",
      subjects: ["Science"],
      country: "United States",
      city: "Portland",
      school: "Vista School",
      yearsOfExperience: 5,
      bio: "",
      website: null,
      interests: [],
      photoURL: null,
      coverImageURL: null,
      role: "educator",
      isVerified: false,
      connectionCount: 0,
      resourceCount: 0,
      postCount: 0,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    });
    await setDoc(doc(context.firestore(), "subscriptions", uid), {
      plan: "free",
      status: "free",
      trialConsumed: false,
      updatedAt: serverTimestamp(),
    });
    // Positive messaging fixtures explicitly accept non-connection messages.
    // Missing preferences in the product continue to default to connections only.
    await setDoc(doc(context.firestore(), "userPrivate", uid), {
      email: `${uid}@vista.local`,
      contactDetails: { professionalEmail: "", phone: "" },
      privacySettings: {
        shareContactInfo: false,
        allowMessagesFromNonConnections: true,
      },
      notificationSettings: { email: true, inApp: true },
      accountDeletion: { requestedAt: null },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

describe("Firestore rules", () => {
  it("allows public profile reads but protects private user data", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "userPrivate", "owner"), {
        email: "owner@example.test",
      });
    });

    await assertSucceeds(
      getDoc(
        doc(testEnv.unauthenticatedContext().firestore(), "users", "owner"),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("other").firestore(),
          "userPrivate",
          "owner",
        ),
      ),
    );
    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext("owner").firestore(),
          "userPrivate",
          "owner",
        ),
      ),
    );
  });

  it("keeps all profile mutations behind server validation", async () => {
    await seedActiveUser("owner");
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertFails(
      updateDoc(doc(ownerDb, "users", "owner"), {
        displayName: "Changed without server validation",
      }),
    );
  });

  it("keeps settings and deletion requests behind server validation", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "userPrivate", "owner"), {
        email: "owner@example.test",
        privacySettings: { shareContactInfo: false },
      });
    });
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertFails(
      updateDoc(doc(ownerDb, "userPrivate", "owner"), {
        privacySettings: { shareContactInfo: true },
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, "userPrivate", "owner"), {
        accountDeletion: { requestedAt: "untrusted" },
      }),
    );
  });

  it("keeps analytics owner-scoped and all aggregate writes server-owned", async () => {
    await seedActiveUser("analytics-owner");
    await seedActiveUser("analytics-outsider");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "userAnalytics", "analytics-owner"),
        { profileViews: 12 },
      );
      await setDoc(doc(context.firestore(), "platformStats", "current"), {
        totalUsers: 2,
      });
    });
    const ownerDb = testEnv.authenticatedContext("analytics-owner").firestore();
    const outsiderDb = testEnv
      .authenticatedContext("analytics-outsider")
      .firestore();

    await assertSucceeds(
      getDoc(doc(ownerDb, "userAnalytics", "analytics-owner")),
    );
    await assertFails(
      getDoc(doc(outsiderDb, "userAnalytics", "analytics-owner")),
    );
    await assertSucceeds(getDoc(doc(ownerDb, "platformStats", "current")));
    await assertFails(
      updateDoc(doc(ownerDb, "userAnalytics", "analytics-owner"), {
        profileViews: 99_999,
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, "platformStats", "current"), {
        totalUsers: 99_999,
      }),
    );
  });

  it("counts one profile view per visiting educator", async () => {
    await seedNetworkUser("profile-owner");
    await seedNetworkUser("profile-viewer");

    await getProfileView("profile-owner", "profile-viewer");
    await getProfileView("profile-owner", "profile-viewer");
    const viewers = await getProfileViewers("profile-owner");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [analytics, view] = await Promise.all([
        getDoc(doc(context.firestore(), "userAnalytics", "profile-owner")),
        getDoc(
          doc(
            context.firestore(),
            "profileViews",
            "profile-owner_profile-viewer",
          ),
        ),
      ]);
      expect(analytics.data()?.profileViews).toBe(1);
      expect(view.exists()).toBe(true);
      expect(viewers).toMatchObject([
        { uid: "profile-viewer", displayName: "profile-viewer" },
      ]);
    });
  });

  it("keeps onboarding profile creation server-owned", async () => {
    const newUserDb = testEnv.authenticatedContext("new-user").firestore();

    await assertFails(
      setDoc(doc(newUserDb, "users", "new-user"), {
        uid: "new-user",
        displayName: "New Educator",
        role: "educator",
        status: "active",
      }),
    );
    await assertFails(
      setDoc(doc(newUserDb, "userPrivate", "new-user"), {
        email: "new@example.test",
      }),
    );
  });

  it("keeps follow documents server-owned", async () => {
    await seedActiveUser("follower");
    await seedActiveUser("educator");
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("follower").firestore(),
          "follows",
          "follower_educator",
        ),
        { followerUid: "follower", followingUid: "educator" },
      ),
    );
  });

  it("creates deterministic conversations, quotas, unread state, and notifications", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");

    const result = await startConversation("sender", {
      recipientId: "recipient",
      content: "Would you like to compare reflection routines?",
    });
    expect(result.conversationId).toBe("recipient_sender");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [conversation, messages, usage, notifications] = await Promise.all([
        getDoc(
          doc(context.firestore(), "conversations", result.conversationId),
        ),
        getDocs(
          collection(
            context.firestore(),
            "conversations",
            result.conversationId,
            "messages",
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "usage",
            "sender_" + new Date().toISOString().slice(0, 10),
          ),
        ),
        getDocs(
          collection(
            context.firestore(),
            "users",
            "recipient",
            "notifications",
          ),
        ),
      ]);
      expect(conversation.data()?.participantIds).toEqual([
        "recipient",
        "sender",
      ]);
      expect(conversation.data()?.unreadCounts).toMatchObject({
        sender: 0,
        recipient: 1,
      });
      expect(messages.size).toBe(1);
      expect(usage.data()?.messages).toBe(1);
      expect(notifications.size).toBe(1);
    });
  });

  it.each(["free", "plus"])(
    "keeps %s messaging free with transactional burst protection",
    async (plan) => {
      await seedNetworkUser("sender");
      await seedNetworkUser("recipient");
      const day = new Date().toISOString().slice(0, 10);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "subscriptions", "sender"), {
          plan,
          status: "active",
        });
        await setDoc(doc(context.firestore(), "usage", `sender_${day}`), {
          uid: "sender",
          messages: 1000,
          messageBurst: { startedAt: new Date(), count: 19 },
        });
      });
      const result = await startConversation("sender", {
        recipientId: "recipient",
        content: "Conversations continue beyond ten daily messages.",
      });
      await expect(
        sendMessage("sender", {
          conversationId: result.conversationId,
          content: "Too fast",
          attachmentId: null,
        }),
      ).rejects.toMatchObject({ code: "rate-limited" });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const usageRef = doc(context.firestore(), "usage", `sender_${day}`);
        expect((await getDoc(usageRef)).data()?.messages).toBe(1001);
        await updateDoc(usageRef, {
          "messageBurst.startedAt": new Date(Date.now() - 61_000),
        });
      });
      await expect(
        sendMessage("sender", {
          conversationId: result.conversationId,
          content: "Ready to continue",
          attachmentId: null,
        }),
      ).resolves.toBeDefined();
    },
  );

  it("enforces blocks and deterministic message reports", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");
    const created = await startConversation("sender", {
      recipientId: "recipient",
      content: "Initial message for moderation coverage.",
    });
    await reportMessage("recipient", {
      conversationId: created.conversationId,
      messageId: created.messageId,
      reason: "spam",
      details: "Repeated promotional content.",
    });
    await expect(
      reportMessage("recipient", {
        conversationId: created.conversationId,
        messageId: created.messageId,
        reason: "spam",
        details: "Repeated promotional content.",
      }),
    ).rejects.toMatchObject({
      code: "already-reported",
    } satisfies Partial<MessageActionError>);

    await setUserBlocked("recipient", {
      blockedUid: "sender",
      blocked: true,
    });
    await expect(
      sendMessage("sender", {
        conversationId: created.conversationId,
        content: "This message should be blocked.",
        attachmentId: null,
      }),
    ).rejects.toMatchObject({
      code: "blocked",
    } satisfies Partial<MessageActionError>);
  });

  it("limits conversation reads to participants and keeps writes server-owned", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");
    await seedNetworkUser("outsider");
    const created = await startConversation("sender", {
      recipientId: "recipient",
      content: "Participant-only conversation.",
    });
    const recipientDb = testEnv.authenticatedContext("recipient").firestore();
    const outsiderDb = testEnv.authenticatedContext("outsider").firestore();
    await assertSucceeds(
      getDoc(doc(recipientDb, "conversations", created.conversationId)),
    );
    await assertFails(
      getDoc(doc(outsiderDb, "conversations", created.conversationId)),
    );
    await assertFails(
      setDoc(
        doc(
          recipientDb,
          "conversations",
          created.conversationId,
          "messages",
          "direct-write",
        ),
        { senderId: "recipient", content: "Untrusted write" },
      ),
    );
    await assertFails(
      updateDoc(
        doc(
          recipientDb,
          "users",
          "recipient",
          "notifications",
          `message_${created.messageId}`,
        ),
        { read: true },
      ),
    );
  });

  it("allows only exact reserved message attachment uploads", async () => {
    await seedNetworkUser("sender");
    const senderStorage = testEnv
      .authenticatedContext("sender")
      .storage(storageBucketUrl);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "messageAttachments", "attachment-one"),
        {
          ownerId: "sender",
          conversationId: "recipient_sender",
          fileType: "application/pdf",
          fileSize: 4,
          path: "messages/recipient_sender/attachment-one/attachment.pdf",
          status: "reserved",
        },
      );
    });
    await assertSucceeds(
      uploadBytes(
        ref(
          senderStorage,
          "messages/recipient_sender/attachment-one/attachment.pdf",
        ),
        new Uint8Array([1, 2, 3, 4]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(
          senderStorage,
          "messages/recipient_sender/attachment-one/wrong.pdf",
        ),
        new Uint8Array([1, 2, 3, 4]),
        { contentType: "application/pdf" },
      ),
    );
  });

  it("enforces Community and Plus AI quotas transactionally", async () => {
    process.env.AI_PROVIDER = "MOCK";
    await seedNetworkUser("free-teacher");
    const source = {
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Local food webs",
      durationMinutes: 50,
      objectives: "",
      standards: "MS-LS2-3",
      studentNeeds: "",
      teachingStyle: "inquiry" as const,
    };
    const communityLesson = await createLesson("free-teacher", source);
    // A second creation is allowed: creation and refinement use one shared pool.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
        doc(
          context.firestore(),
          "usage",
          `free-teacher_${new Date().toISOString().slice(0, 7)}`,
        ),
        { lastAiLessonAt: new Date(0) },
      );
    });
    await createLesson("free-teacher", source);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
        doc(
          context.firestore(),
          "usage",
          `free-teacher_${new Date().toISOString().slice(0, 7)}`,
        ),
        { lastAiLessonAt: new Date(0) },
      );
    });
    await regenerateLesson(
      "free-teacher",
      communityLesson.id,
      undefined,
      undefined,
      undefined,
      {
        expectedVersion: communityLesson.currentVersion,
        requestId: randomUUID(),
      },
    );
    await expect(createLesson("free-teacher", source)).rejects.toMatchObject({
      code: "limit-reached",
    });
    await expect(
      regenerateLesson(
        "free-teacher",
        communityLesson.id,
        undefined,
        undefined,
        undefined,
        {
          expectedVersion: communityLesson.currentVersion + 1,
          requestId: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ code: "limit-reached" });
    for (const format of ["pdf", "docx", "pdf", "docx"] as const) {
      expect(
        (await createLessonExport("free-teacher", communityLesson.id, format))
          .bytes.length,
      ).toBeGreaterThan(0);
    }

    // AI exhaustion must not gate manual work or weaken export authorization.
    await updateLesson(
      "free-teacher",
      communityLesson.id,
      communityLesson.content,
    );
    await duplicateLesson("free-teacher", communityLesson.id);
    expect((await getLessonWorkspace("free-teacher")).usage.used).toBe(3);
    await seedNetworkUser("export-outsider");
    await expect(
      createLessonExport("export-outsider", communityLesson.id, "pdf"),
    ).rejects.toMatchObject({ code: "not-owner" });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "users", "free-teacher"), {
        status: "suspended",
      });
    });
    await expect(
      createLessonExport("free-teacher", communityLesson.id, "docx"),
    ).rejects.toMatchObject({ code: "inactive" });

    await seedNetworkUser("plus-teacher");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "subscriptions", "plus-teacher"), {
        plan: "plus",
        status: "active",
        trialConsumed: false,
      });
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `plus-teacher_${new Date().toISOString().slice(0, 7)}`,
        ),
        { uid: "plus-teacher", aiLessons: 50 },
      );
    });
    await expect(createLesson("plus-teacher", source)).rejects.toMatchObject({
      code: "limit-reached",
    } satisfies Partial<LessonActionError>);
  });

  it("persists lesson versions, edits, regeneration, and duplication atomically", async () => {
    process.env.AI_PROVIDER = "MOCK";
    await seedNetworkUser("lesson-owner");
    await seedNetworkUser("lesson-outsider");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "subscriptions", "lesson-owner"), {
        plan: "plus",
        status: "active",
        trialConsumed: false,
      });
    });
    const created = await createLesson("lesson-owner", {
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Local food webs",
      durationMinutes: 50,
      objectives: "",
      standards: "MS-LS2-3",
      studentNeeds: "Use sentence frames.",
      teachingStyle: "inquiry",
    });
    expect(created.currentVersion).toBe(1);
    expect(created.versions).toHaveLength(1);
    expect(created.visibility).toBe("draft");

    const edited = await updateLesson(
      "lesson-owner",
      created.id,
      {
        ...created.content,
        title: "Revised local food webs",
      },
      "published",
    );
    expect(edited.currentVersion).toBe(2);
    expect(edited.versions[0]?.kind).toBe("edited");
    expect(edited.visibility).toBe("published");
    await expect(
      getSharedLesson(created.id, "lesson-outsider"),
    ).resolves.toMatchObject({
      id: created.id,
      title: "Revised local food webs",
      ownedByViewer: false,
    });
    const lessonActivity = (
      await getFeedPage("lesson-outsider", "all")
    ).posts.find((post) => post.activity?.kind === "lesson-published");
    expect(lessonActivity).toMatchObject({
      type: "activity",
      content: "",
      activity: {
        title: "Revised local food webs",
        href: `/lessons/${created.id}`,
      },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const resource = await getDoc(
        doc(context.firestore(), "resources", `lesson_${created.id}`),
      );
      expect(resource.data()).toMatchObject({
        sourceLessonId: created.id,
        type: "lesson-plan",
        status: "active",
        moderationStatus: "approved",
      });
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `lesson-owner_${new Date().toISOString().slice(0, 7)}`,
        ),
        { lastAiLessonAt: new Date(0) },
        { merge: true },
      );
    });
    const regenerated = await regenerateLesson(
      "lesson-owner",
      created.id,
      undefined,
      undefined,
      undefined,
      { expectedVersion: edited.currentVersion, requestId: randomUUID() },
    );
    expect(regenerated.currentVersion).toBe(3);
    expect(regenerated.versions[0]?.kind).toBe("generated");

    const duplicate = await duplicateLesson("lesson-owner", created.id);
    expect(duplicate.content.title).toContain("(Copy)");
    expect(duplicate.versions[0]?.kind).toBe("duplicated");
    expect(duplicate.visibility).toBe("draft");

    const ownerDb = testEnv.authenticatedContext("lesson-owner").firestore();
    const outsiderDb = testEnv
      .authenticatedContext("lesson-outsider")
      .firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "lessons", created.id)));
    await assertSucceeds(
      getDoc(doc(ownerDb, "lessons", created.id, "versions", "v1")),
    );
    await assertFails(getDoc(doc(outsiderDb, "lessons", created.id)));
    await assertFails(
      getDoc(doc(outsiderDb, "lessons", created.id, "versions", "v1")),
    );
    await assertFails(
      updateDoc(doc(ownerDb, "lessons", created.id), {
        currentVersion: 999,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb, "lessons", created.id, "versions", "v999"), {
        ownerId: "lesson-owner",
        version: 999,
      }),
    );
    await deleteLesson("lesson-owner", created.id);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const resource = await getDoc(
        doc(context.firestore(), "resources", `lesson_${created.id}`),
      );
      expect(resource.exists()).toBe(false);
    });
  });

  it("resolves accepted connections symmetrically and updates counters once", async () => {
    await seedNetworkUser("follower");
    await seedNetworkUser("educator");

    await followEducator("follower", "educator");
    await acceptConnectionRequest("follower", "educator");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [follower, educator, relationship] = await Promise.all([
        getDoc(doc(context.firestore(), "users", "follower")),
        getDoc(doc(context.firestore(), "users", "educator")),
        getDoc(doc(context.firestore(), "follows", "follower_educator")),
      ]);
      expect(follower.data()?.connectionCount).toBe(1);
      expect(educator.data()?.connectionCount).toBe(1);
      expect(relationship.exists()).toBe(true);
    });

    await expect(
      resolveConnectionRelationship("follower", "educator"),
    ).resolves.toMatchObject({ status: "accepted", direction: "outgoing" });
    await expect(
      resolveConnectionRelationship("educator", "follower"),
    ).resolves.toMatchObject({ status: "accepted", direction: "incoming" });
    await expect(followEducator("educator", "follower")).rejects.toMatchObject({
      code: "already-following",
    } satisfies Partial<NetworkActionError>);

    const [
      followerDiscovery,
      educatorDiscovery,
      followerSuggestions,
      educatorSuggestions,
      followerConnections,
      educatorConnections,
    ] = await Promise.all([
      discoverEducators("follower", {
        query: "",
        subject: "",
        grade: "",
        location: "",
        verified: false,
      }),
      discoverEducators("educator", {
        query: "",
        subject: "",
        grade: "",
        location: "",
        verified: false,
      }),
      getNetworkList("follower", "follower", "suggestions"),
      getNetworkList("educator", "educator", "suggestions"),
      getNetworkList("follower", "follower", "connections"),
      getNetworkList("educator", "educator", "connections"),
    ]);
    expect(followerDiscovery.map((result) => result.profile.uid)).not.toContain(
      "educator",
    );
    expect(educatorDiscovery.map((result) => result.profile.uid)).not.toContain(
      "follower",
    );
    expect(
      followerSuggestions.map((result) => result.profile.uid),
    ).not.toContain("educator");
    expect(
      educatorSuggestions.map((result) => result.profile.uid),
    ).not.toContain("follower");
    expect(followerConnections.map((result) => result.profile.uid)).toContain(
      "educator",
    );
    expect(educatorConnections.map((result) => result.profile.uid)).toContain(
      "follower",
    );

    await unfollowEducator("educator", "follower");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [follower, educator, relationship] = await Promise.all([
        getDoc(doc(context.firestore(), "users", "follower")),
        getDoc(doc(context.firestore(), "users", "educator")),
        getDoc(doc(context.firestore(), "follows", "follower_educator")),
      ]);
      expect(follower.data()?.connectionCount).toBe(0);
      expect(educator.data()?.connectionCount).toBe(0);
      expect(relationship.exists()).toBe(false);
    });
  });

  it.each(["free", "plus"])(
    "allows %s connections beyond five and limits request bursts",
    async (plan) => {
      await seedNetworkUser("follower", { connectionCount: 100 });
      await seedNetworkUser("educator");
      await seedNetworkUser("another-educator");
      const day = new Date().toISOString().slice(0, 10);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "subscriptions", "follower"), {
          plan,
          status: "active",
        });
        await setDoc(doc(context.firestore(), "usage", `follower_${day}`), {
          uid: "follower",
          connectionRequestBurst: { startedAt: new Date(), count: 9 },
        });
      });
      await followEducator("follower", "educator");
      await expect(
        followEducator("follower", "another-educator"),
      ).rejects.toMatchObject({ code: "rate-limited" });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "usage", `follower_${day}`), {
          "connectionRequestBurst.startedAt": new Date(Date.now() - 61_000),
        });
      });
      await expect(
        followEducator("follower", "another-educator"),
      ).resolves.toBeUndefined();
    },
  );

  it("enforces ownership for resource, forum, and message edits", async () => {
    await Promise.all([
      seedActiveUser("edit-owner"),
      seedActiveUser("edit-outsider"),
    ]);
    const createdAt = new Date("2026-08-04T12:00:00.000Z");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "resources", "editable-resource"), {
          authorId: "edit-owner",
          title: "Original resource",
          description: "An original classroom resource.",
          type: "activity",
          subject: "Science",
          gradeLevel: "Grade 6",
          tags: [],
          accessTier: "free",
          status: "active",
          createdAt,
          updatedAt: createdAt,
        }),
        setDoc(doc(db, "forumThreads", "editable-thread"), {
          authorId: "edit-owner",
          categoryId: "discussion",
          title: "Original discussion title",
          content: "Original discussion content with enough detail.",
          tags: [],
          locked: false,
          createdAt,
          updatedAt: createdAt,
        }),
        setDoc(
          doc(
            db,
            "forumThreads",
            "editable-thread",
            "replies",
            "editable-reply",
          ),
          {
            authorId: "edit-owner",
            content: "Original reply.",
            createdAt,
            updatedAt: createdAt,
          },
        ),
        setDoc(doc(db, "conversations", "editable-conversation"), {
          participantIds: ["edit-owner", "edit-outsider"],
          lastMessageAt: createdAt,
          lastMessagePreview: "Original message.",
          createdAt,
          updatedAt: createdAt,
        }),
        setDoc(
          doc(
            db,
            "conversations",
            "editable-conversation",
            "messages",
            "editable-message",
          ),
          {
            senderId: "edit-owner",
            content: "Original message.",
            attachment: null,
            createdAt,
            updatedAt: createdAt,
          },
        ),
      ]);
    });

    await expect(
      updateResource("edit-outsider", {
        resourceId: "editable-resource",
        title: "Unauthorized resource",
        description: "An unauthorized classroom resource.",
        type: "activity",
        subject: "Science",
        gradeLevel: "Grade 6",
        tags: [],
        accessTier: "free",
      }),
    ).rejects.toMatchObject({
      code: "not-owner",
    } satisfies Partial<ResourceActionError>);
    await expect(
      updateForumThread("edit-outsider", {
        threadId: "editable-thread",
        title: "Unauthorized discussion title",
        content: "Unauthorized discussion content with enough detail.",
        tags: [],
      }),
    ).rejects.toMatchObject({
      code: "not-owner",
    } satisfies Partial<ForumActionError>);
    await expect(
      updateForumReply("edit-outsider", {
        threadId: "editable-thread",
        replyId: "editable-reply",
        content: "Unauthorized reply.",
      }),
    ).rejects.toMatchObject({
      code: "not-owner",
    } satisfies Partial<ForumActionError>);
    await expect(
      editMessage(
        "edit-outsider",
        "editable-conversation",
        "editable-message",
        "Unauthorized message.",
      ),
    ).rejects.toMatchObject({
      code: "not-owner",
    } satisfies Partial<MessageActionError>);

    await Promise.all([
      updateResource("edit-owner", {
        resourceId: "editable-resource",
        title: "Updated resource",
        description: "An updated classroom resource.",
        type: "activity",
        subject: "Science",
        gradeLevel: "Grade 6",
        tags: ["ecosystems"],
        accessTier: "free",
      }),
      updateForumThread("edit-owner", {
        threadId: "editable-thread",
        title: "Updated discussion title",
        content: "Updated discussion content with enough detail.",
        tags: ["discussion"],
      }),
      updateForumReply("edit-owner", {
        threadId: "editable-thread",
        replyId: "editable-reply",
        content: "Updated reply.",
      }),
      editMessage(
        "edit-owner",
        "editable-conversation",
        "editable-message",
        "Updated message.",
      ),
    ]);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const [resource, thread, reply, message, conversation] =
        await Promise.all([
          getDoc(doc(db, "resources", "editable-resource")),
          getDoc(doc(db, "forumThreads", "editable-thread")),
          getDoc(
            doc(
              db,
              "forumThreads",
              "editable-thread",
              "replies",
              "editable-reply",
            ),
          ),
          getDoc(
            doc(
              db,
              "conversations",
              "editable-conversation",
              "messages",
              "editable-message",
            ),
          ),
          getDoc(doc(db, "conversations", "editable-conversation")),
        ]);
      expect(resource.data()?.title).toBe("Updated resource");
      expect(thread.data()?.title).toBe("Updated discussion title");
      expect(reply.data()?.content).toBe("Updated reply.");
      expect(message.data()?.content).toBe("Updated message.");
      expect(conversation.data()?.lastMessagePreview).toBe("Updated message.");
    });
  });

  it("starts the server-owned trial once and denies direct billing writes", async () => {
    await seedActiveUser("trial-owner");
    await seedSubscription("trial-owner");
    const now = new Date("2026-08-04T12:00:00.000Z");

    const state = await startVistaTrial("trial-owner", now);
    expect(state.effectivePlan).toBe("plus");
    expect(state.lifecycle).toBe("vista_trial");
    expect(state.trialEndsAt?.toISOString()).toBe("2026-08-18T12:00:00.000Z");
    await expect(startVistaTrial("trial-owner", now)).rejects.toMatchObject({
      code: "trial-unavailable",
    } satisfies Partial<BillingError>);

    const ownerDb = testEnv.authenticatedContext("trial-owner").firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "subscriptions", "trial-owner")));
    await assertFails(
      updateDoc(doc(ownerDb, "subscriptions", "trial-owner"), {
        plan: "plus",
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb, "billingEvents", "forged-event"), {
        uid: "trial-owner",
        applied: true,
      }),
    );
    await assertFails(getDoc(doc(ownerDb, "billingEvents", "forged-event")));
  });

  it("deduplicates Stripe events and ignores older lifecycle updates", async () => {
    await seedActiveUser("billing-owner");
    await seedSubscription("billing-owner");
    await adminDb()
      .doc("userPrivate/billing-owner")
      .set({ notificationSettings: { inApp: false, email: false } });
    const currentEvent = {
      id: "evt-current",
      type: "subscription.updated" as const,
      uid: "billing-owner",
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      customerId: "cus_owner",
      subscriptionId: "sub_owner",
      priceId: "price_plus_monthly",
      interval: "month" as const,
      status: "active" as const,
      currentPeriodEnd: new Date("2026-09-04T12:00:00.000Z"),
      cancelAtPeriodEnd: true,
    };

    await expect(reconcileBillingEvent(currentEvent)).resolves.toMatchObject({
      applied: true,
    });
    await expect(reconcileBillingEvent(currentEvent)).resolves.toMatchObject({
      applied: false,
    });
    expect(
      (
        await adminDb()
          .doc("users/billing-owner/notifications/evt-current")
          .get()
      ).data(),
    ).toMatchObject({
      type: "billing-cancellation-scheduled",
      read: false,
      archived: false,
    });
    const delivered = await adminDb()
      .doc("users/billing-owner/notifications/evt-current")
      .get();
    expect(delivered.data()?.createdAt.toMillis()).toBeGreaterThan(
      Date.now() - 60_000,
    );
    await expect(
      reconcileBillingEvent({
        ...currentEvent,
        id: "evt-stale",
        createdAt: new Date("2026-08-04T11:59:59.000Z"),
        status: "canceled",
      }),
    ).resolves.toMatchObject({ applied: false });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [subscription, current, stale] = await Promise.all([
        getDoc(doc(context.firestore(), "subscriptions", "billing-owner")),
        getDoc(doc(context.firestore(), "billingEvents", "evt-current")),
        getDoc(doc(context.firestore(), "billingEvents", "evt-stale")),
      ]);
      expect(subscription.data()?.status).toBe("active");
      expect(current.data()?.applied).toBe(true);
      expect(stale.data()?.applied).toBe(false);
    });
  });

  it("activates Plus on checkout completion to avoid duplicate charges", async () => {
    await seedActiveUser("checkout-owner");
    await seedSubscription("checkout-owner");

    const event = {
      id: "evt-checkout-complete",
      type: "checkout.completed" as const,
      uid: "checkout-owner",
      createdAt: new Date("2026-08-05T10:00:00.000Z"),
      customerId: "cus_checkout_owner",
      subscriptionId: "sub_checkout_owner",
      interval: "year" as const,
    };

    await expect(reconcileBillingEvent(event)).resolves.toMatchObject({
      applied: true,
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [subscription, storedEvent] = await Promise.all([
        getDoc(doc(context.firestore(), "subscriptions", "checkout-owner")),
        getDoc(
          doc(context.firestore(), "billingEvents", "evt-checkout-complete"),
        ),
      ]);
      expect(subscription.data()?.plan).toBe("plus");
      expect(subscription.data()?.status).toBe("active");
      expect(subscription.data()?.billingInterval).toBe("year");
      expect(subscription.data()?.stripeCustomerId).toBe("cus_checkout_owner");
      expect(subscription.data()?.stripeSubscriptionId).toBe(
        "sub_checkout_owner",
      );
      expect(storedEvent.data()?.applied).toBe(true);
    });
  });

  it("prevents suspended users from creating posts", async () => {
    await seedActiveUser("suspended", "suspended");
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("suspended").firestore(),
          "posts",
          "post-one",
        ),
        { authorId: "suspended", moderationStatus: "approved" },
      ),
    );
  });

  it("keeps all post and interaction writes behind server validation", async () => {
    await seedActiveUser("author");
    const authorDb = testEnv.authenticatedContext("author").firestore();

    await assertFails(
      setDoc(doc(authorDb, "posts", "inflated-post"), {
        authorId: "author",
        likeCount: 10_000,
        commentCount: 0,
        shareCount: 0,
        moderationStatus: "approved",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "posts", "safe-post"), {
        authorId: "author",
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        moderationStatus: "pending",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "postLikes", "safe-post_author"), {
        postId: "safe-post",
        uid: "author",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "postBookmarks", "author_safe-post"), {
        postId: "safe-post",
        uid: "author",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "reports", "post_safe-post_author"), {
        reporterId: "author",
        targetType: "post",
        targetId: "safe-post",
      }),
    );
  });

  it("updates feed counters transactionally and enforces post ownership", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reader");
    await expect(getFeedPage("reader", "saved")).resolves.toEqual({
      posts: [],
      nextCursor: null,
    });
    const postId = await createPost("author", {
      type: "question",
      content: "How do you structure peer feedback?",
      imageURLs: [],
      fileAttachments: [],
      linkURLs: [],
      tags: ["Feedback"],
      resourceId: null,
      mentionUids: ["reader"],
    });

    await setPostLiked("reader", postId, true);
    await setPostBookmarked("reader", postId, true);
    await setPostBookmarked("reader", postId, true);
    await expect(recordPostShare("reader", postId)).resolves.toBe(true);
    await expect(recordPostShare("reader", postId)).resolves.toBe(false);
    const commentId = await addPostComment("reader", {
      postId,
      content: "I use a two-stars-and-a-wish protocol.",
      mentionUids: ["author"],
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [
        post,
        author,
        like,
        bookmark,
        likeNotification,
        commentNotification,
        postMention,
        commentMention,
      ] = await Promise.all([
        getDoc(doc(context.firestore(), "posts", postId)),
        getDoc(doc(context.firestore(), "users", "author")),
        getDoc(doc(context.firestore(), "postLikes", `${postId}_reader`)),
        getDoc(doc(context.firestore(), "postBookmarks", `reader_${postId}`)),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "author",
            "notifications",
            `post-like_${postId}_reader`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "author",
            "notifications",
            `post-comment_${commentId}`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "reader",
            "notifications",
            `mention_post_${postId}_author`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "author",
            "notifications",
            `mention_comment_${commentId}_reader`,
          ),
        ),
      ]);
      expect(post.data()).toMatchObject({
        authorId: "author",
        moderationStatus: "approved",
        likeCount: 1,
        commentCount: 1,
        bookmarkCount: 1,
        shareCount: 1,
      });
      expect(author.data()?.postCount).toBe(1);
      expect(like.exists()).toBe(true);
      expect(bookmark.exists()).toBe(true);
      expect(likeNotification.data()?.href).toBe(`/post/${postId}`);
      expect(commentNotification.exists()).toBe(false);
      expect(postMention.data()?.href).toBe(`/post/${postId}`);
      expect(commentMention.data()?.href).toBe(
        `/post/${postId}#comment-${commentId}`,
      );
    });

    await expect(deletePost("reader", postId)).rejects.toMatchObject({
      code: "not-owner",
    } satisfies Partial<FeedActionError>);
    await deletePost("author", postId);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [post, author] = await Promise.all([
        getDoc(doc(context.firestore(), "posts", postId)),
        getDoc(doc(context.firestore(), "users", "author")),
      ]);
      expect(post.exists()).toBe(false);
      expect(author.data()?.postCount).toBe(0);
    });
  });

  it("allows unlimited resource reservations and keeps metadata server-owned", async () => {
    await seedNetworkUser("author");
    const input = {
      title: "Fraction comparison cards",
      description: "A classroom-ready card activity for comparing fractions.",
      type: "activity" as const,
      subject: "Mathematics",
      gradeLevel: "Grades 3-5",
      tags: ["Fractions"],
      accessTier: "free" as const,
      fileName: "fraction-cards.pdf",
      fileType: "application/pdf" as const,
      fileSize: 1024,
    };
    for (let index = 0; index < 6; index += 1) {
      const reservation = await reserveResourceUpload("author", {
        ...input,
        title: `${input.title} ${index}`,
      });
      expect(reservation.uploadsRemaining).toBeNull();
    }
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("author").firestore(),
          "resources",
          "unsafe",
        ),
        { authorId: "author", status: "active", moderationStatus: "approved" },
      ),
    );
  });

  it("turns resource-tagged posts into completable resource drafts", async () => {
    await seedNetworkUser("post-resource-author");
    const postId = await createPost("post-resource-author", {
      type: "post",
      content:
        "Plant cell comparison cards for a middle school science lesson.",
      imageURLs: [],
      fileAttachments: [],
      linkURLs: [],
      tags: ["Resources", "Science"],
      resourceId: null,
    });
    const drafts = await listIncompleteResources("post-resource-author");
    expect(drafts).toMatchObject([
      {
        id: `post_${postId}`,
        sourcePostId: postId,
        tags: ["resources", "science"],
      },
    ]);
    const dashboard = await getDashboardData(
      "post-resource-author",
      "educator",
    );
    expect(dashboard.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "resource-draft",
          href: expect.stringContaining(`complete=post_${postId}`),
        }),
      ]),
    );

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const reservation = await reserveResourceUpload("post-resource-author", {
      draftResourceId: `post_${postId}`,
      title: "Plant cell comparison cards",
      description: "Printable cards for comparing plant cell structures.",
      type: "activity",
      subject: "Science",
      gradeLevel: "Grade 7",
      tags: ["resources", "science"],
      accessTier: "free",
      fileName: "plant-cells.pdf",
      fileType: "application/pdf",
      fileSize: bytes.length,
    });
    await uploadBytes(
      ref(
        testEnv
          .authenticatedContext("post-resource-author")
          .storage(storageBucketUrl),
        reservation.uploadPath,
      ),
      bytes,
      { contentType: "application/pdf" },
    );
    await finalizeResourceUpload(
      "post-resource-author",
      reservation.resourceId,
    );
    expect(await listIncompleteResources("post-resource-author")).toEqual([]);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const resource = await getDoc(
        doc(context.firestore(), "resources", `post_${postId}`),
      );
      expect(resource.data()).toMatchObject({
        sourcePostId: postId,
        status: "active",
        moderationStatus: "approved",
      });
    });
  });

  it("uploads common images and PowerPoint resources and cleans failed reservations", async () => {
    await seedNetworkUser("image-author");
    const base = {
      title: "Classroom image resource",
      description: "A classroom-ready image with accessible context.",
      type: "activity" as const,
      subject: "Art",
      gradeLevel: "Grades 3-5",
      tags: ["visual"],
      accessTier: "free" as const,
    };

    for (const [extension, fileType] of [
      ["jpg", "image/jpeg"],
      ["png", "image/png"],
      ["heic", "image/heic"],
      ["heif", "image/heif"],
      ["ppt", "application/vnd.ms-powerpoint"],
      [
        "pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ],
    ] as const) {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
      const reservation = await reserveResourceUpload("image-author", {
        ...base,
        title: `${base.title} ${extension}`,
        fileName: `classroom.${extension}`,
        fileType,
        fileSize: bytes.length,
      });
      await uploadBytes(
        ref(
          testEnv
            .authenticatedContext("image-author")
            .storage(storageBucketUrl),
          reservation.uploadPath,
        ),
        bytes,
        { contentType: fileType },
      );
      await finalizeResourceUpload("image-author", reservation.resourceId);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const resource = await getDoc(
          doc(context.firestore(), "resources", reservation.resourceId),
        );
        expect(resource.data()?.status).toBe("active");
      });
    }

    const failed = await reserveResourceUpload("image-author", {
      ...base,
      fileName: "missing.png",
      fileType: "image/png",
      fileSize: 4,
    });
    await expect(
      finalizeResourceUpload("image-author", failed.resourceId),
    ).rejects.toMatchObject({ code: "invalid-upload" });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [resource, usage] = await Promise.all([
        getDoc(doc(context.firestore(), "resources", failed.resourceId)),
        getDoc(
          doc(
            context.firestore(),
            "usage",
            `image-author_${new Date().toISOString().slice(0, 7)}`,
          ),
        ),
      ]);
      expect(resource.exists()).toBe(false);
      expect(usage.data()?.resourceUploads).toBe(6);
    });
  });

  it("keeps Community resource downloads unlimited", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("downloader");
    const filePath = "resources/author/download-test/resource.pdf";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "resources", "download-test"), {
        authorId: "author",
        status: "uploading",
        moderationStatus: "pending",
        accessTier: "free",
        filePath,
        fileName: "resource.pdf",
        fileType: "application/pdf",
        fileSize: 4,
        downloadCount: 0,
      });
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `downloader_${new Date().toISOString().slice(0, 7)}`,
        ),
        { uid: "downloader", resourceDownloads: 5 },
      );
    });
    await uploadBytes(
      ref(
        testEnv.authenticatedContext("author").storage(storageBucketUrl),
        filePath,
      ),
      new Uint8Array([1, 2, 3, 4]),
      { contentType: "application/pdf" },
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "resources", "download-test"), {
        status: "active",
        moderationStatus: "approved",
      });
    });

    await expect(
      downloadResource("downloader", "download-test"),
    ).resolves.toMatchObject({
      fileName: "resource.pdf",
    });
    await expect(
      downloadResource("author", "download-test"),
    ).resolves.toMatchObject({
      fileName: "resource.pdf",
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const resource = await getDoc(
        doc(context.firestore(), "resources", "download-test"),
      );
      expect(resource.data()?.downloadCount).toBe(1);
    });
  });

  it("projects live resource and lesson counters onto the dashboard", async () => {
    await seedNetworkUser("analytics-owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "resources", "analytics-resource"), {
          authorId: "analytics-owner",
          title: "Dashboard resource",
          description: "A resource used to validate live dashboard totals.",
          type: "lesson-plan",
          subject: "Science",
          gradeLevel: "Grade 5",
          tags: ["science"],
          accessTier: "free",
          downloadCount: 7,
          ratingAverage: 0,
          ratingCount: 0,
          status: "active",
          moderationStatus: "approved",
          createdAt: serverTimestamp(),
        }),
        setDoc(doc(db, "lessons", "analytics-lesson-one"), {
          ownerId: "analytics-owner",
        }),
        setDoc(doc(db, "lessons", "analytics-lesson-two"), {
          ownerId: "analytics-owner",
        }),
      ]);
    });

    const dashboard = await getDashboardData("analytics-owner", "educator");
    expect(dashboard.analytics.summary.resourceDownloadsTotal).toBe(7);
    expect(dashboard.analytics.summary.lessonsGeneratedTotal).toBe(2);
    expect(dashboard.topResources[0]).toMatchObject({
      id: "analytics-resource",
      downloadCount: 7,
    });
  });

  it("upserts one review per educator and maintains rating aggregates", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reviewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "resources", "resource-one"), {
        authorId: "author",
        status: "active",
        moderationStatus: "approved",
        ratingTotal: 0,
        ratingAverage: 0,
        ratingCount: 0,
      });
    });
    await reviewResource("reviewer", {
      resourceId: "resource-one",
      rating: 4,
      review: "Clear and useful.",
    });
    await reviewResource("reviewer", {
      resourceId: "resource-one",
      rating: 5,
      review: "Even better after a second look.",
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [resource, review] = await Promise.all([
        getDoc(doc(context.firestore(), "resources", "resource-one")),
        getDoc(
          doc(context.firestore(), "resourceReviews", "resource-one_reviewer"),
        ),
      ]);
      expect(resource.data()).toMatchObject({
        ratingTotal: 5,
        ratingAverage: 5,
        ratingCount: 1,
      });
      expect(review.data()?.rating).toBe(5);
    });
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("reviewer").firestore(),
          "resourceReviews",
          "resource-one_other",
        ),
        { resourceId: "resource-one", authorId: "reviewer", rating: 5 },
      ),
    );
  });

  it("keeps forum documents server-owned and updates trusted counters", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reviewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "forumCategories", "student-engagement"),
        {
          name: "Student Engagement",
          active: true,
          threadCount: 0,
          postCount: 0,
          order: 0,
        },
      );
    });
    const threadId = await createForumThread("author", {
      categoryId: "student-engagement",
      title: "How do you structure student-led discussion?",
      content:
        "I am looking for routines that make space for every learner to contribute.",
      tags: ["discussion"],
      mentionUids: ["reviewer"],
    });
    const forumActivity = (await getFeedPage("reviewer", "all")).posts.find(
      (post) => post.activity?.kind === "forum-thread",
    );
    expect(forumActivity).toMatchObject({
      type: "activity",
      content: "",
      activity: {
        href: `/forum/${threadId}`,
        title: "How do you structure student-led discussion?",
      },
    });
    const replyId = await addForumReply("reviewer", {
      threadId,
      parentReplyId: null,
      content: "Silent writing before partner talk has worked well for us.",
      mentionUids: ["author"],
    });
    const nestedReplyId = await addForumReply("author", {
      threadId,
      parentReplyId: replyId,
      content: "That sounds like a useful way to make thinking visible.",
      mentionUids: [],
    });
    await expect(
      addForumReply("reviewer", {
        threadId,
        parentReplyId: nestedReplyId,
        content: "A third nesting level should not be created.",
        mentionUids: [],
      }),
    ).rejects.toMatchObject({ code: "invalid-parent" });
    await expect(
      getForumThread(threadId, "reviewer", "educator"),
    ).resolves.toMatchObject({ thread: { viewCount: 1 } });
    await expect(
      getForumThread(threadId, "reviewer", "educator"),
    ).resolves.toMatchObject({ thread: { viewCount: 1 } });
    await expect(
      getForumThread(threadId, "author", "educator"),
    ).resolves.toMatchObject({ thread: { viewCount: 2 } });
    await setForumLiked("reviewer", threadId, null, true);
    await setForumLiked("reviewer", threadId, replyId, true);
    await acceptForumReply("author", "educator", threadId, replyId);
    await moderateForumThread("author", "educator", {
      threadId,
      action: "lock",
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [
        category,
        thread,
        reply,
        nestedReply,
        replyNotification,
        nestedReplyNotification,
        likeNotification,
        threadMention,
        replyMention,
      ] = await Promise.all([
        getDoc(
          doc(context.firestore(), "forumCategories", "student-engagement"),
        ),
        getDoc(doc(context.firestore(), "forumThreads", threadId)),
        getDoc(
          doc(
            context.firestore(),
            "forumThreads",
            threadId,
            "replies",
            replyId,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "forumThreads",
            threadId,
            "replies",
            nestedReplyId,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "author",
            "notifications",
            `forum-reply_${threadId}_${replyId}`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "reviewer",
            "notifications",
            `forum-reply_${threadId}_${nestedReplyId}`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "author",
            "notifications",
            `forum-like_thread_${threadId}_reviewer`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "reviewer",
            "notifications",
            `mention_forum_thread_${threadId}_author`,
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "users",
            "author",
            "notifications",
            `mention_forum_reply_${threadId}_${replyId}_reviewer`,
          ),
        ),
      ]);
      expect(category.data()).toMatchObject({ threadCount: 1, postCount: 3 });
      expect(thread.data()).toMatchObject({
        likeCount: 1,
        replyCount: 2,
        solved: true,
        acceptedReplyId: replyId,
        locked: true,
        viewCount: 2,
      });
      expect(reply.data()).toMatchObject({ likeCount: 1, accepted: true });
      expect(nestedReply.data()).toMatchObject({
        parentReplyId: replyId,
        accepted: false,
      });
      expect(replyNotification.exists()).toBe(false);
      expect(nestedReplyNotification.data()).toMatchObject({
        message: "author replied to your forum comment.",
        href: `/forum/${threadId}#reply-${nestedReplyId}`,
      });
      expect(likeNotification.data()?.href).toBe(`/forum/${threadId}`);
      expect(threadMention.data()?.href).toBe(`/forum/${threadId}`);
      expect(replyMention.data()?.href).toBe(
        `/forum/${threadId}#reply-${replyId}`,
      );
    });
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("author").firestore(),
          "forumThreads",
          "pinned-thread",
        ),
        {
          authorId: "author",
          pinned: true,
          locked: false,
          solved: false,
          acceptedReplyId: null,
          viewCount: 0,
          likeCount: 0,
          replyCount: 0,
          moderationStatus: "approved",
        },
      ),
    );
  });

  it("creates one deterministic forum report per educator", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reporter");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "forumThreads", "thread-one"), {
        authorId: "author",
        moderationStatus: "approved",
        reportCount: 0,
      });
    });
    const report = {
      threadId: "thread-one",
      replyId: null,
      reason: "spam" as const,
      details: "Repeated promotional links.",
    };
    await reportForumContent("reporter", report);
    await expect(reportForumContent("reporter", report)).rejects.toMatchObject({
      code: "already-reported",
    } satisfies Partial<ForumActionError>);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const thread = await getDoc(
        doc(context.firestore(), "forumThreads", "thread-one"),
      );
      expect(thread.data()?.reportCount).toBe(1);
    });
  });

  it("requires conversation membership", async () => {
    await seedActiveUser("a");
    await seedActiveUser("c");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "conversations", "a_b"), {
        participantIds: ["a", "b"],
      });
    });

    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext("a").firestore(),
          "conversations",
          "a_b",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("c").firestore(),
          "conversations",
          "a_b",
        ),
      ),
    );
  });

  it("keeps lessons owner-only and subscriptions server-owned", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "lessons", "lesson-one"), {
        ownerId: "owner",
      });
    });

    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext("owner").firestore(),
          "lessons",
          "lesson-one",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("other").firestore(),
          "lessons",
          "lesson-one",
        ),
      ),
    );
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("owner").firestore(),
          "subscriptions",
          "owner",
        ),
        { plan: "plus" },
      ),
    );
  });

  it("allows only platform administrators to read audit logs", async () => {
    await seedActiveUser("admin");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "auditLogs", "audit-one"), {
        action: "user.suspended",
      });
    });

    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("educator").firestore(),
          "auditLogs",
          "audit-one",
        ),
      ),
    );
    await assertSucceeds(
      getDoc(
        doc(
          testEnv
            .authenticatedContext("admin", { role: "platform_admin" })
            .firestore(),
          "auditLogs",
          "audit-one",
        ),
      ),
    );
    const adminDb = testEnv
      .authenticatedContext("admin", { role: "platform_admin" })
      .firestore();
    await assertFails(
      setDoc(doc(adminDb, "auditLogs", "forged-audit"), {
        actorId: "admin",
        action: "user.status",
      }),
    );
    await assertFails(
      updateDoc(doc(adminDb, "auditLogs", "audit-one"), {
        action: "tampered",
      }),
    );
  });

  it("rejects educators and protects administrator accounts", async () => {
    await seedNetworkUser("target-admin", { role: "platform_admin" });
    await expect(
      performAdminAction(
        { uid: "educator", role: "educator" },
        {
          action: "user.status",
          targetId: "target-admin",
          status: "suspended",
          reason: "Unauthorized attempt.",
        },
      ),
    ).rejects.toMatchObject({
      code: "admin-required",
    } satisfies Partial<AdminActionError>);
    await expect(
      performAdminAction(
        { uid: "admin", role: "platform_admin" },
        {
          action: "user.status",
          targetId: "target-admin",
          status: "suspended",
          reason: "Protected account test.",
        },
      ),
    ).rejects.toMatchObject({
      code: "protected-target",
    } satisfies Partial<AdminActionError>);
  });

  it("moderates content, reports, and verification with immutable audits", async () => {
    await seedNetworkUser("review-target", { isVerified: false });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "posts", "review-post"), {
          authorId: "review-target",
          content: "Reported post",
          moderationStatus: "approved",
          updatedAt: serverTimestamp(),
        }),
        setDoc(doc(db, "reports", "review-report"), {
          reporterId: "reporter",
          targetType: "post",
          targetId: "review-post",
          status: "open",
          createdAt: serverTimestamp(),
        }),
        setDoc(doc(db, "verificationRequests", "review-verification"), {
          uid: "review-target",
          evidencePath: "verification/review-target/evidence.pdf",
          status: "pending",
          createdAt: serverTimestamp(),
        }),
        setDoc(doc(db, "platformStats", "current"), {
          pendingReports: 1,
          pendingVerifications: 1,
        }),
      ]);
    });
    const actor = { uid: "admin", role: "platform_admin" as const };

    await performAdminAction(actor, {
      action: "content.moderate",
      targetType: "post",
      targetId: "review-post",
      parentId: null,
      status: "rejected",
      reason: "Violates the community guidelines.",
    });
    await performAdminAction(actor, {
      action: "report.resolve",
      targetId: "review-report",
      resolution: "resolved",
      reason: "Content was reviewed and removed.",
    });
    await performAdminAction(actor, {
      action: "verification.decide",
      targetId: "review-verification",
      decision: "approved",
      reason: "Professional evidence confirmed.",
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const [post, report, verification, user, stats, audits] =
        await Promise.all([
          getDoc(doc(db, "posts", "review-post")),
          getDoc(doc(db, "reports", "review-report")),
          getDoc(doc(db, "verificationRequests", "review-verification")),
          getDoc(doc(db, "users", "review-target")),
          getDoc(doc(db, "platformStats", "current")),
          getDocs(collection(db, "auditLogs")),
        ]);
      expect(post.data()?.moderationStatus).toBe("rejected");
      expect(report.data()?.status).toBe("resolved");
      expect(report.data()?.assignedAdminId).toBe("admin");
      expect(verification.data()?.status).toBe("approved");
      expect(user.data()?.isVerified).toBe(true);
      expect(stats.data()?.pendingReports).toBe(0);
      expect(stats.data()?.pendingVerifications).toBe(0);
      expect(audits.size).toBe(3);
      expect(
        audits.docs.every((audit) => audit.data().actorId === "admin"),
      ).toBe(true);
    });
  });
});

describe("Storage rules", () => {
  it("allows active owners to upload safe avatars", async () => {
    await seedActiveUser("owner");
    const storage = testEnv
      .authenticatedContext("owner")
      .storage(storageBucketUrl);

    await assertSucceeds(
      uploadBytes(
        ref(storage, "users/owner/avatar/avatar.png"),
        new Uint8Array([1]),
        {
          contentType: "image/png",
        },
      ),
    );
  });

  it("rejects another user's upload and unsafe avatar MIME types", async () => {
    await seedActiveUser("owner");
    const otherStorage = testEnv
      .authenticatedContext("other")
      .storage(storageBucketUrl);
    const ownerStorage = testEnv
      .authenticatedContext("owner")
      .storage(storageBucketUrl);

    await assertFails(
      uploadBytes(
        ref(otherStorage, "users/owner/avatar/avatar.png"),
        new Uint8Array([1]),
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(ownerStorage, "users/owner/avatar/avatar.svg"),
        new Uint8Array([1]),
        { contentType: "image/svg+xml" },
      ),
    );
  });

  it("keeps profile cover writes server-owned", async () => {
    await seedActiveUser("owner");
    const ownerStorage = testEnv
      .authenticatedContext("owner")
      .storage(storageBucketUrl);

    await assertFails(
      uploadBytes(
        ref(ownerStorage, "users/owner/cover/cover.webp"),
        new Uint8Array([1]),
        { contentType: "image/webp" },
      ),
    );
  });

  it("limits post media and document writes to active owners and reads to signed-in users", async () => {
    await seedActiveUser("owner");
    await seedActiveUser("other");
    const ownerStorage = testEnv
      .authenticatedContext("owner")
      .storage(storageBucketUrl);
    const otherStorage = testEnv
      .authenticatedContext("other")
      .storage(storageBucketUrl);
    const postPath = "posts/owner/post-one/classroom.webp";

    await assertSucceeds(
      uploadBytes(ref(ownerStorage, postPath), new Uint8Array([1]), {
        contentType: "image/webp",
      }),
    );
    await assertSucceeds(getBytes(ref(otherStorage, postPath)));
    await seedActiveUser("other", "deleted");
    await assertFails(getBytes(ref(otherStorage, postPath)));
    await seedActiveUser("other");
    const documentPath = "posts/owner/post-one/lesson-plan.pdf";
    await assertSucceeds(
      uploadBytes(ref(ownerStorage, documentPath), new Uint8Array([1]), {
        contentType: "application/pdf",
      }),
    );
    await assertSucceeds(getBytes(ref(otherStorage, documentPath)));
    for (const [fileName, contentType] of [
      ["lesson.ppt", "application/vnd.ms-powerpoint"],
      [
        "lesson.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ],
    ] as const) {
      const powerPointPath = `posts/owner/post-one/${fileName}`;
      await assertSucceeds(
        uploadBytes(ref(ownerStorage, powerPointPath), new Uint8Array([1]), {
          contentType,
        }),
      );
      await assertSucceeds(getBytes(ref(otherStorage, powerPointPath)));
    }
    await assertFails(
      uploadBytes(
        ref(ownerStorage, "posts/owner/post-one/archive.zip"),
        new Uint8Array([1]),
        { contentType: "application/zip" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(otherStorage, "posts/owner/post-two/classroom.webp"),
        new Uint8Array([1]),
        { contentType: "image/webp" },
      ),
    );
    await assertFails(
      getBytes(
        ref(
          testEnv.unauthenticatedContext().storage(storageBucketUrl),
          postPath,
        ),
      ),
    );
  });

  it("accepts safe owner verification evidence but denies every direct read", async () => {
    await seedActiveUser("owner");
    const ownerStorage = testEnv
      .authenticatedContext("owner")
      .storage(storageBucketUrl);
    const otherStorage = testEnv
      .authenticatedContext("other")
      .storage(storageBucketUrl);
    const adminStorage = testEnv
      .authenticatedContext("admin", { role: "platform_admin" })
      .storage(storageBucketUrl);
    const evidencePath = "verification/owner/evidence.pdf";

    await assertSucceeds(
      uploadBytes(ref(ownerStorage, evidencePath), new Uint8Array([1]), {
        contentType: "application/pdf",
      }),
    );
    await assertFails(getBytes(ref(ownerStorage, evidencePath)));
    await assertFails(getBytes(ref(adminStorage, evidencePath)));
    await assertFails(
      uploadBytes(
        ref(otherStorage, "verification/owner/forged.pdf"),
        new Uint8Array([1]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(ownerStorage, "verification/owner/evidence.html"),
        new Uint8Array([1]),
        { contentType: "text/html" },
      ),
    );
  });

  it("allows only files matching a server-created resource reservation", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "resources", "reserved"), {
        authorId: "owner",
        status: "uploading",
        filePath: "resources/owner/reserved/resource.pdf",
        fileType: "application/pdf",
        fileSize: 3,
      });
    });
    const storage = testEnv
      .authenticatedContext("owner")
      .storage(storageBucketUrl);
    await assertSucceeds(
      uploadBytes(
        ref(storage, "resources/owner/reserved/resource.pdf"),
        new Uint8Array([1, 2, 3]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "resources/owner/orphan/resource.pdf"),
        new Uint8Array([1, 2, 3]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "resources/owner/reserved/resource.pdf"),
        new Uint8Array([1, 2]),
        { contentType: "application/pdf" },
      ),
    );
  });
});
