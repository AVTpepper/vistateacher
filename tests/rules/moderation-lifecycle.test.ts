// @vitest-environment node
/**
 * Canonical moderation lifecycle coverage using vitest.rules.config.ts.
 * This follows tests/rules/lesson-reliability.test.ts: real
 * exported server functions + an isolated demo Firestore emulator. Storage is
 * in memory and the lesson provider is mocked; no Storage emulator/paid AI call.
 * The existing memory-firestore double omits the query/transform behavior these
 * counter, version, and feed assertions need, so it is intentionally not used.
 *
 * Expectations implement docs/audit/moderation-follow-up.md. In particular,
 * resourceCount counts status=active regardless of moderation, and finalization
 * may complete rejected owner work as active/rejected, with no public activity.
 * Rejection/domain-error assertions use the current exported not-found error.
 * If the implementation deliberately changes that public contract, adapt those
 * assertions while retaining denial, side-effect, and owner-access assertions.
 *
 * Helper-access gaps: none for the requested cases. All use existing exported
 * functions, including writePublicActivity. Private lessonResourceData and
 * runGeneration are covered through save/restore/regenerate/backfill. Future
 * resource-report routing and rule authorization need separate tests once their
 * interfaces exist; no proposed production helper/route is invented here.
 */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
  vi,
} from "vitest";

import { adminDb } from "@/lib/firebase/admin";
import { performAdminAction } from "@/lib/admin/server";
import {
  getFeedPage,
  getPost,
  publicActivityRef,
  writePublicActivity,
  type PublicActivityInput,
} from "@/lib/feed/server";
import {
  ensurePublishedLessonResources,
  getLesson,
  getSharedLesson,
  regenerateLesson,
  restoreLessonVersion,
  updateLesson,
} from "@/lib/lessons/server";
import * as provider from "@/lib/lessons/provider";
import { createMockLesson } from "@/lib/lessons/mock-provider";
import * as network from "@/lib/network/server";
import {
  cancelResourceUpload,
  downloadResource,
  finalizeResourceUpload,
  getResourceDetail,
  listOwnedResources,
  reserveResourceUpload,
  reviewResource,
} from "@/lib/resources/server";
import { lessonSourceSchema } from "@/schemas/lesson";

type StoredFixtureFile = {
  bytes: Buffer;
  contentType: string;
  generation?: string;
  metageneration?: number;
  cacheControl?: string;
  metadata?: { firebaseStorageDownloadTokens?: string };
};
type FixtureMetadata = {
  size: string;
  contentType: string;
  generation: string;
  metageneration: string;
  cacheControl?: string;
  metadata: { firebaseStorageDownloadTokens?: string };
};
type MetadataUpdate = {
  cacheControl: string;
  metadata: { firebaseStorageDownloadTokens: null };
};
type MetadataCondition = {
  preconditionOpts: { ifMetagenerationMatch?: string | number };
};

const storage = vi.hoisted(() => ({
  files: new Map<string, StoredFixtureFile>(),
  metadata: vi.fn<(path: string) => Promise<FixtureMetadata[]>>(),
  setMetadata:
    vi.fn<
      (
        path: string,
        data: MetadataUpdate,
        options: MetadataCondition,
      ) => Promise<FixtureMetadata[]>
    >(),
  download: vi.fn<(path: string) => Promise<Buffer[]>>(),
}));

vi.mock("@/lib/firebase/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firebase/admin")>();
  return {
    ...actual,
    adminStorage: () => ({
      bucket: () => ({
        file: (path: string) => ({
          getMetadata: () => storage.metadata(path),
          setMetadata: (data: MetadataUpdate, options: MetadataCondition) =>
            storage.setMetadata(path, data, options),
          download: () => storage.download(path),
          delete: async () => {
            storage.files.delete(path);
          },
        }),
      }),
    }),
  };
});

const OWNER = "moderation-owner";
const PEER = "moderation-peer";
const ADMIN = { uid: "moderation-admin", role: "platform_admin" as const };
const BASE_MILLIS = Date.UTC(2026, 10, 25, 12);
const STAMP = Timestamp.fromMillis(BASE_MILLIS);
const source = lessonSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Local habitats",
  durationMinutes: 50,
  teachingStyle: "balanced",
  studentNeeds: "PRIVATE_MODERATION_LEARNER_CONTEXT",
  additionalInstructions: "PRIVATE_MODERATION_TEACHER_INSTRUCTIONS",
  language: "English",
});
const pdfBytes = Buffer.from("%PDF-1.4\nmoderation regression fixture\n%%EOF");
let environment: RulesTestEnvironment | undefined;

const lessonRef = (id: string) => adminDb().doc(`lessons/${id}`);
const resourceRef = (id: string) => adminDb().doc(`resources/${id}`);
const activityRef = (id: string) => adminDb().doc(`posts/${id}`);
const ownerRef = () => adminDb().doc(`users/${OWNER}`);
const peerUsageRef = () =>
  adminDb().doc(`usage/${PEER}_${new Date().toISOString().slice(0, 7)}`);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function storedFile(path: string) {
  const file = storage.files.get(path);
  if (!file) throw new Error(`Missing test upload: ${path}`);
  return file;
}

function fileMetadata(path: string): FixtureMetadata {
  const file = storedFile(path);
  return {
    size: String(file.bytes.length),
    contentType: file.contentType,
    generation: file.generation ?? "1",
    metageneration: String(file.metageneration ?? 1),
    ...(file.cacheControl ? { cacheControl: file.cacheControl } : {}),
    metadata: {
      ...(file.metadata ?? {
        firebaseStorageDownloadTokens: "fixture-download-token",
      }),
    },
  };
}

async function rejectResource(resourceId: string) {
  await performAdminAction(ADMIN, {
    action: "content.moderate",
    targetType: "resource",
    targetId: resourceId,
    parentId: null,
    status: "rejected",
    reason: "Regression fixture: resource rejected by administrator.",
  });
}

async function seedActivity(input: PublicActivityInput) {
  const reference = await adminDb().runTransaction(async (transaction) => {
    const existing = await transaction.get(publicActivityRef(input));
    return writePublicActivity(transaction, input, existing);
  });
  await reference.update({ createdAt: STAMP, updatedAt: STAMP });
  return reference.id;
}

async function seedPublishedLesson(lessonId = "published-lesson") {
  const content = {
    ...createMockLesson(source),
    title: "Current habitat lesson",
  };
  const original = { ...content, title: "Original habitat lesson" };
  const resourceId = `lesson_${lessonId}`;
  const batch = adminDb().batch();
  batch.set(lessonRef(lessonId), {
    ownerId: OWNER,
    source,
    content,
    visibility: "published",
    status: "ready",
    generationStatus: "idle",
    currentVersion: 2,
    sampleMode: true,
    createdAt: STAMP,
    publishedAt: STAMP,
    updatedAt: STAMP,
  });
  for (const [version, versionContent] of [
    [1, original],
    [2, content],
  ] as const)
    batch.set(lessonRef(lessonId).collection("versions").doc(`v${version}`), {
      ownerId: OWNER,
      version,
      source,
      content: versionContent,
      kind: version === 1 ? "generated" : "edited",
      sampleMode: true,
      createdAt: STAMP,
    });
  batch.set(resourceRef(resourceId), {
    authorId: OWNER,
    sourceLessonId: lessonId,
    title: content.title,
    titleLower: content.title.toLowerCase(),
    description: "A published interactive habitat lesson for the classroom.",
    type: "lesson-plan",
    subject: content.subject,
    subjectLower: content.subject.toLowerCase(),
    gradeLevel: content.gradeLevel,
    tags: ["lesson-plan", "science"],
    accessTier: "free",
    status: "active",
    moderationStatus: "approved",
    filePath: null,
    downloadCount: 0,
    ratingTotal: 0,
    ratingCount: 0,
    ratingAverage: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
  });
  batch.update(ownerRef(), { resourceCount: FieldValue.increment(1) });
  await batch.commit();
  const input: PublicActivityInput = {
    authorId: OWNER,
    kind: "lesson-published",
    entityId: lessonId,
    label: "Published a lesson plan",
    title: content.title,
    href: `/lessons/${lessonId}`,
    tags: ["lesson-plan", "science"],
  };
  const activityId = await seedActivity(input);
  return { lessonId, resourceId, activityId, content, original, input };
}

async function reservePdf() {
  const reservation = await reserveResourceUpload(OWNER, {
    title: "Habitat classroom resource",
    description: "A complete printable habitat resource for the classroom.",
    type: "worksheet",
    subject: "Science",
    gradeLevel: "Grade 5",
    tags: ["science"],
    accessTier: "free",
    fileName: "habitats.pdf",
    fileType: "application/pdf",
    fileSize: pdfBytes.length,
  });
  storage.files.set(reservation.uploadPath, {
    bytes: pdfBytes,
    contentType: "application/pdf",
  });
  return reservation;
}

async function publishPdf() {
  const reservation = await reservePdf();
  await finalizeResourceUpload(OWNER, reservation.resourceId);
  return {
    ...reservation,
    activityId: `activity_resource-published_${reservation.resourceId}`,
  };
}

async function seedVisiblePost(id = "visible-authored-post") {
  await activityRef(id).set({
    authorId: OWNER,
    type: "post",
    content: "This independently moderated post stays visible.",
    imageURLs: [],
    fileAttachments: [],
    linkURLs: [],
    tags: [],
    mentions: [],
    resourceId: null,
    visibility: "public",
    moderationStatus: "approved",
    createdAt: Timestamp.fromMillis(BASE_MILLIS - 60_000),
    updatedAt: STAMP,
  });
  return id;
}

async function bookmark(postId: string, createdAt = STAMP) {
  await adminDb().doc(`postBookmarks/${PEER}_${postId}`).set({
    uid: PEER,
    postId,
    createdAt,
  });
}

async function expectRejectedAndHidden(lessonId: string, resourceId: string) {
  expect((await resourceRef(resourceId).get()).data()?.moderationStatus).toBe(
    "rejected",
  );
  expect(await getSharedLesson(lessonId, PEER)).toBeNull();
  expect(await getResourceDetail(resourceId, PEER)).toBeNull();
  // Rejection hides community delivery without deleting the teacher's work.
  expect((await getLesson(OWNER, lessonId)).id).toBe(lessonId);
}

beforeAll(async () => {
  // Preserve the existing demo-only fixture boundary when this draft is activated.
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher"
  )
    throw new Error(
      "Activate this draft only with the isolated demo emulator.",
    );
  environment = await initializeTestEnvironment({
    projectId: "demo-vista-teacher",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  storage.files.clear();
  storage.metadata
    .mockReset()
    .mockImplementation(async (path) => [fileMetadata(path)]);
  storage.setMetadata
    .mockReset()
    .mockImplementation(async (path, data, options) => {
      const file = storedFile(path);
      if (
        String(options.preconditionOpts.ifMetagenerationMatch) !==
        String(file.metageneration ?? 1)
      )
        throw new Error("Metadata precondition failed");
      if (
        data.metadata.firebaseStorageDownloadTokens !== null ||
        data.cacheControl !== "private, no-store"
      )
        throw new Error("Unexpected private metadata update");
      file.metadata = {};
      file.cacheControl = data.cacheControl;
      file.metageneration = (file.metageneration ?? 1) + 1;
      return [fileMetadata(path)];
    });
  storage.download
    .mockReset()
    .mockImplementation(async (path) => [storedFile(path).bytes]);
  vi.spyOn(provider, "generateLessonPlan").mockImplementation(async (brief) =>
    createMockLesson(brief),
  );
  vi.spyOn(network, "getAcceptedConnectionUids").mockResolvedValue(
    new Set([OWNER]),
  );
  const batch = adminDb().batch();
  batch.set(ownerRef(), {
    status: "active",
    displayName: "Teacher",
    resourceCount: 0,
  });
  batch.set(adminDb().doc(`users/${PEER}`), {
    status: "active",
    displayName: "Peer",
  });
  batch.set(adminDb().doc(`users/${ADMIN.uid}`), {
    status: "active",
    displayName: "Administrator",
    role: ADMIN.role,
  });
  batch.set(adminDb().doc(`subscriptions/${OWNER}`), {
    plan: "plus",
    status: "active",
  });
  await batch.commit();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await environment?.clearFirestore();
});
afterAll(async () => environment?.cleanup());

describe("canonical lesson moderation", () => {
  it("requires the matching source link even for an approved canonical lesson resource", async () => {
    const fixture = await seedPublishedLesson();
    await resourceRef(fixture.resourceId).update({
      sourceLessonId: FieldValue.delete(),
    });
    expect(await getSharedLesson(fixture.lessonId, PEER)).toBeNull();
    expect(await getResourceDetail(fixture.resourceId, PEER)).toBeNull();
    expect(await getPost(PEER, fixture.activityId)).toBeNull();
    expect(
      (await getSharedLesson(fixture.lessonId, OWNER))?.publiclyAvailable,
    ).toBe(false);
  });

  it("keeps a published lesson with no canonical record private until backfill", async () => {
    const fixture = await seedPublishedLesson();
    await resourceRef(fixture.resourceId).delete();
    expect(await getSharedLesson(fixture.lessonId, PEER)).toBeNull();
    expect((await getSharedLesson(fixture.lessonId, OWNER))?.content).toEqual(
      fixture.content,
    );
  });

  it("delivers an approved lesson without private brief/history, then hides a rejected lesson from a peer", async () => {
    const fixture = await seedPublishedLesson();
    const shared = await getSharedLesson(fixture.lessonId, PEER);
    expect(shared?.content).toEqual(fixture.content);
    expect(shared?.versions).toEqual([]);
    expect(JSON.stringify(shared)).not.toContain("PRIVATE_MODERATION_");
    await rejectResource(fixture.resourceId);
    await expectRejectedAndHidden(fixture.lessonId, fixture.resourceId);
    expect((await ownerRef().get()).data()?.resourceCount).toBe(1);
  });

  it.each([
    "save",
    "restore",
    "regenerate",
    "backfill",
    "draft-then-publish",
  ] as const)(
    "preserves rejection through %s using the current public API",
    async (operation) => {
      const fixture = await seedPublishedLesson();
      await rejectResource(fixture.resourceId);
      if (operation === "save") {
        const saved = await updateLesson(
          OWNER,
          fixture.lessonId,
          { ...fixture.content, assessment: "Teacher's revised assessment." },
          undefined,
          2,
        );
        expect(saved.currentVersion).toBe(3);
      } else if (operation === "restore") {
        const restored = await restoreLessonVersion(
          OWNER,
          fixture.lessonId,
          1,
          2,
        );
        expect(restored.content.title).toBe(fixture.original.title);
        expect(restored.currentVersion).toBe(3);
      } else if (operation === "regenerate") {
        const regenerated = await regenerateLesson(
          OWNER,
          fixture.lessonId,
          undefined,
          undefined,
          undefined,
          { expectedVersion: 2, requestId: randomUUID() },
        );
        expect(regenerated.currentVersion).toBe(3);
        expect(provider.generateLessonPlan).toHaveBeenCalledTimes(1);
      } else if (operation === "backfill") {
        await ensurePublishedLessonResources(OWNER);
        await ensurePublishedLessonResources(OWNER);
        expect(
          (await ownerRef().get()).data()?.publishedLessonResourcesBackfilledAt,
        ).toBeInstanceOf(Timestamp);
      } else {
        const draft = await updateLesson(
          OWNER,
          fixture.lessonId,
          fixture.content,
          "draft",
          2,
        );
        expect((await ownerRef().get()).data()?.resourceCount).toBe(0);
        await updateLesson(
          OWNER,
          fixture.lessonId,
          draft.content,
          "published",
          draft.currentVersion,
        );
      }
      await expectRejectedAndHidden(fixture.lessonId, fixture.resourceId);
      expect((await ownerRef().get()).data()?.resourceCount).toBe(1);
    },
  );

  it("retains rejected moderation while a lesson is withdrawn, before any republish", async () => {
    const fixture = await seedPublishedLesson();
    await rejectResource(fixture.resourceId);
    await updateLesson(OWNER, fixture.lessonId, fixture.content, "draft", 2);
    expect((await resourceRef(fixture.resourceId).get()).data()).toMatchObject({
      status: "draft",
      moderationStatus: "rejected",
    });
    expect((await ownerRef().get()).data()?.resourceCount).toBe(0);
    expect(await getSharedLesson(fixture.lessonId, PEER)).toBeNull();
  });

  it("keeps an administrator rejection committed while a regeneration provider is pending", async () => {
    const fixture = await seedPublishedLesson();
    const response = deferred<ReturnType<typeof createMockLesson>>();
    vi.mocked(provider.generateLessonPlan).mockReturnValueOnce(
      response.promise,
    );
    const completion = regenerateLesson(
      OWNER,
      fixture.lessonId,
      undefined,
      undefined,
      undefined,
      { expectedVersion: 2, requestId: randomUUID() },
    );
    // Attach a rejection observer immediately while waiting for the provider gate.
    const outcome = completion.then(
      (lesson) => ({ lesson }),
      (error: unknown) => ({ error }),
    );
    try {
      await vi.waitFor(() =>
        expect(provider.generateLessonPlan).toHaveBeenCalledTimes(1),
      );
      await rejectResource(fixture.resourceId);
    } finally {
      response.resolve(createMockLesson(source));
    }
    expect(await outcome).toMatchObject({ lesson: { currentVersion: 3 } });
    await expectRejectedAndHidden(fixture.lessonId, fixture.resourceId);
  });
});

describe("resource delivery and upload moderation", () => {
  it.each([undefined, "malformed"])(
    "does not approve a legacy draft with invalid moderation %s during upload retry",
    async (previousModeration) => {
      const resourceId = "post_legacy-draft";
      await resourceRef(resourceId).set({
        authorId: OWNER,
        title: "Legacy resource draft",
        status: "draft",
        ...(previousModeration ? { moderationStatus: previousModeration } : {}),
        sourcePostId: "legacy-draft",
        completionStatus: "incomplete",
        createdAt: STAMP,
      });
      const input = {
        draftResourceId: resourceId,
        title: "Habitat classroom resource",
        description: "A complete printable habitat resource for the classroom.",
        type: "worksheet" as const,
        subject: "Science",
        gradeLevel: "Grade 5",
        tags: ["science"],
        accessTier: "free" as const,
        fileName: "habitats.pdf",
        fileType: "application/pdf" as const,
        fileSize: pdfBytes.length,
      };
      await reserveResourceUpload(OWNER, input);
      await cancelResourceUpload(OWNER, resourceId);
      const reservation = await reserveResourceUpload(OWNER, input);
      storage.files.set(reservation.uploadPath, {
        bytes: pdfBytes,
        contentType: "application/pdf",
      });
      await finalizeResourceUpload(OWNER, resourceId);
      expect((await resourceRef(resourceId).get()).data()).toMatchObject({
        status: "active",
        moderationStatus: "pending",
      });
      expect(await getResourceDetail(resourceId, PEER)).toBeNull();
      expect(
        await getPost(PEER, `activity_resource-published_${resourceId}`),
      ).toBeNull();
    },
  );

  it("retains completed hidden resources in the owner's inventory and private download", async () => {
    const { resourceId } = await publishPdf();
    await rejectResource(resourceId);
    expect(
      (await listOwnedResources(OWNER)).find((item) => item.id === resourceId),
    ).toMatchObject({ moderationStatus: "rejected", publiclyAvailable: false });
    expect(
      (await getResourceDetail(resourceId, OWNER))?.resource,
    ).toMatchObject({ moderationStatus: "rejected", publiclyAvailable: false });
    expect((await downloadResource(OWNER, resourceId)).bytes).toEqual(pdfBytes);
    expect((await resourceRef(resourceId).get()).data()?.downloadCount).toBe(0);
  });

  it("preserves a draft rejection through upload reservation, cancellation and completion", async () => {
    const resourceId = "post_rejected-draft";
    await resourceRef(resourceId).set({
      authorId: OWNER,
      title: "Rejected resource draft",
      status: "draft",
      moderationStatus: "rejected",
      sourcePostId: "rejected-draft",
      completionStatus: "incomplete",
      createdAt: STAMP,
    });
    const input = {
      draftResourceId: resourceId,
      title: "Habitat classroom resource",
      description: "A complete printable habitat resource for the classroom.",
      type: "worksheet" as const,
      subject: "Science",
      gradeLevel: "Grade 5",
      tags: ["science"],
      accessTier: "free" as const,
      fileName: "habitats.pdf",
      fileType: "application/pdf" as const,
      fileSize: pdfBytes.length,
    };
    await reserveResourceUpload(OWNER, input);
    await cancelResourceUpload(OWNER, resourceId);
    expect((await resourceRef(resourceId).get()).data()).toMatchObject({
      status: "draft",
      moderationStatus: "rejected",
    });
    const reservation = await reserveResourceUpload(OWNER, input);
    storage.files.set(reservation.uploadPath, {
      bytes: pdfBytes,
      contentType: "application/pdf",
    });
    await finalizeResourceUpload(OWNER, resourceId);
    expect((await resourceRef(resourceId).get()).data()).toMatchObject({
      status: "active",
      moderationStatus: "rejected",
    });
    expect((await ownerRef().get()).data()?.resourceCount).toBe(1);
    expect(await getResourceDetail(resourceId, PEER)).toBeNull();
  });

  it("allows approved resource download/review as a positive control", async () => {
    const { resourceId, uploadPath } = await publishPdf();
    expect(storage.setMetadata).toHaveBeenCalledWith(
      uploadPath,
      {
        cacheControl: "private, no-store",
        metadata: { firebaseStorageDownloadTokens: null },
      },
      { preconditionOpts: { ifMetagenerationMatch: "1" } },
    );
    expect(fileMetadata(uploadPath)).toMatchObject({
      generation: "1",
      metageneration: "2",
      cacheControl: "private, no-store",
      metadata: {},
    });
    expect((await downloadResource(PEER, resourceId)).bytes).toEqual(pdfBytes);
    await reviewResource(PEER, {
      resourceId,
      rating: 4,
      review: "Useful in class.",
    });
    expect((await resourceRef(resourceId).get()).data()).toMatchObject({
      downloadCount: 1,
      ratingCount: 1,
      ratingTotal: 4,
    });
  });

  it("denies a rejected resource download without reading Storage or mutating usage/counters/notifications", async () => {
    const { resourceId } = await publishPdf();
    await rejectResource(resourceId);
    await expect(downloadResource(PEER, resourceId)).rejects.toMatchObject({
      code: "not-found",
    });
    expect(storage.download).not.toHaveBeenCalled();
    expect((await peerUsageRef().get()).exists).toBe(false);
    expect((await resourceRef(resourceId).get()).data()?.downloadCount).toBe(0);
    expect(
      (
        await adminDb()
          .doc(
            `users/${OWNER}/notifications/resource-download_${resourceId}_${PEER}`,
          )
          .get()
      ).exists,
    ).toBe(false);
  });

  it("rechecks rejection committed during Storage transfer before returning bytes or side effects", async () => {
    const { resourceId } = await publishPdf();
    storage.download.mockImplementationOnce(async (path) => {
      const file = storedFile(path);
      await rejectResource(resourceId);
      return [file.bytes];
    });
    await expect(downloadResource(PEER, resourceId)).rejects.toMatchObject({
      code: "not-found",
    });
    expect(storage.download).toHaveBeenCalledTimes(1);
    expect((await resourceRef(resourceId).get()).data()?.downloadCount).toBe(0);
    expect((await peerUsageRef().get()).exists).toBe(false);
    expect(
      (
        await adminDb()
          .doc(
            `users/${OWNER}/notifications/resource-download_${resourceId}_${PEER}`,
          )
          .get()
      ).exists,
    ).toBe(false);
  });

  it("denies reviewing a rejected resource without changing ratings or creating a review", async () => {
    const { resourceId } = await publishPdf();
    await rejectResource(resourceId);
    await expect(
      reviewResource(PEER, {
        resourceId,
        rating: 5,
        review: "This should never be committed.",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
    expect((await resourceRef(resourceId).get()).data()).toMatchObject({
      ratingCount: 0,
      ratingTotal: 0,
      ratingAverage: 0,
    });
    expect(
      (await adminDb().doc(`resourceReviews/${resourceId}_${PEER}`).get())
        .exists,
    ).toBe(false);
  });

  it("preserves a rejection made after finalization's initial read but before its commit", async () => {
    const { resourceId } = await reservePdf();
    storage.metadata.mockImplementationOnce(async (path) => {
      await rejectResource(resourceId);
      return [fileMetadata(path)];
    });
    // The documented minimal policy completes owner work as active/rejected.
    await finalizeResourceUpload(OWNER, resourceId);
    expect((await resourceRef(resourceId).get()).data()).toMatchObject({
      status: "active",
      moderationStatus: "rejected",
      completionStatus: "complete",
    });
    expect((await ownerRef().get()).data()?.resourceCount).toBe(1);
    expect(await getResourceDetail(resourceId, PEER)).toBeNull();
    const activityId = `activity_resource-published_${resourceId}`;
    expect(await getPost(PEER, activityId)).toBeNull();
    expect((await getFeedPage(PEER, "all")).posts).toEqual([]);
  });
});

describe("derived activity visibility and durable state", () => {
  it.each(["all", "following", "saved"] as const)(
    "continues %s after the raw scan budget ends on hidden sources",
    async (view) => {
      const visibleId = await seedVisiblePost();
      const batch = adminDb().batch();
      for (let index = 0; index < 205; index++) {
        const id = `orphan-${index}`;
        batch.set(activityRef(id), {
          authorId: OWNER,
          type: "activity",
          activityKind: "resource-published",
          activityEntityId: `missing-${index}`,
          moderationStatus: "approved",
          createdAt: Timestamp.fromMillis(BASE_MILLIS + index),
        });
        if (view === "saved")
          batch.set(adminDb().doc(`postBookmarks/${PEER}_${id}`), {
            uid: PEER,
            postId: id,
            createdAt: Timestamp.fromMillis(BASE_MILLIS + index),
          });
      }
      await batch.commit();
      if (view === "saved")
        await bookmark(visibleId, Timestamp.fromMillis(BASE_MILLIS - 60_000));
      const first = await getFeedPage(PEER, view);
      expect(first.posts).toEqual([]);
      expect(first.nextCursor).toBeTruthy();
      const second = await getFeedPage(PEER, view, first.nextCursor!);
      expect(second.posts.map((post) => post.id)).toEqual([visibleId]);
      expect(second.nextCursor).toBeNull();
    },
  );

  it("does not skip unconsumed raw rows when a visible page fills mid-batch", async () => {
    const batch = adminDb().batch();
    for (let index = 0; index < 25; index++)
      batch.set(activityRef(`visible-${index}`), {
        authorId: OWNER,
        type: "post",
        content: `Visible ${index}`,
        moderationStatus: "approved",
        createdAt: Timestamp.fromMillis(BASE_MILLIS + index),
      });
    await batch.commit();
    const first = await getFeedPage(PEER, "all");
    const second = await getFeedPage(PEER, "all", first.nextCursor!);
    const third = await getFeedPage(PEER, "all", second.nextCursor!);
    expect([
      first.posts.length,
      second.posts.length,
      third.posts.length,
    ]).toEqual([10, 10, 5]);
    const ids = [...first.posts, ...second.posts, ...third.posts].map(
      (post) => post.id,
    );
    expect(new Set(ids).size).toBe(25);
    expect(third.nextCursor).toBeNull();
  });

  it("hides an approved resource announcement after canonical rejection", async () => {
    const fixture = await publishPdf();
    expect((await getPost(PEER, fixture.activityId))?.id).toBe(
      fixture.activityId,
    );
    await rejectResource(fixture.resourceId);
    expect(await getPost(PEER, fixture.activityId)).toBeNull();
  });

  it.each(["all", "following", "saved"] as const)(
    "hides rejected lesson activities in %s while retaining an independent visible post",
    async (view) => {
      const fixture = await seedPublishedLesson();
      const visibleId = await seedVisiblePost();
      await bookmark(fixture.activityId);
      await bookmark(visibleId, Timestamp.fromMillis(BASE_MILLIS - 1));
      await rejectResource(fixture.resourceId);
      expect(await getPost(PEER, fixture.activityId)).toBeNull();
      expect(
        (await getFeedPage(PEER, view)).posts.map((post) => post.id),
      ).toEqual([visibleId]);
    },
  );

  it.each(["all", "following", "saved"] as const)(
    "hides an unpublished lesson activity from %s and direct post delivery",
    async (view) => {
      const fixture = await seedPublishedLesson();
      await bookmark(fixture.activityId);
      await updateLesson(OWNER, fixture.lessonId, fixture.content, "draft", 2);
      expect(await getPost(PEER, fixture.activityId)).toBeNull();
      expect((await getFeedPage(PEER, view)).posts).toEqual([]);
    },
  );

  it("does not expose a hidden derived announcement through the activity author bypass", async () => {
    const fixture = await seedPublishedLesson();
    await rejectResource(fixture.resourceId);
    expect(await getPost(OWNER, fixture.activityId)).toBeNull();
    expect((await getLesson(OWNER, fixture.lessonId)).content).toEqual(
      fixture.content,
    );
  });

  it("preserves an existing activity rejection, reports, counters and original publication time on refresh", async () => {
    const fixture = await seedPublishedLesson();
    // Direct stored rejection models a pre-fix independent activity decision.
    // New admin activity actions may instead resolve to the canonical resource.
    await activityRef(fixture.activityId).update({
      moderationStatus: "rejected",
      reportCount: 4,
      likeCount: 2,
      bookmarkCount: 3,
    });
    await adminDb().runTransaction(async (transaction) => {
      const existing = await transaction.get(activityRef(fixture.activityId));
      writePublicActivity(
        transaction,
        {
          ...fixture.input,
          title: "Refreshed announcement title",
        },
        existing,
      );
    });
    const activity = (await activityRef(fixture.activityId).get()).data()!;
    expect(activity).toMatchObject({
      moderationStatus: "rejected",
      reportCount: 4,
      likeCount: 2,
      bookmarkCount: 3,
    });
    expect((activity.createdAt as Timestamp).toMillis()).toBe(BASE_MILLIS);
    expect(await getPost(PEER, fixture.activityId)).toBeNull();
  });

  it("can paginate beyond a page of orphaned announcements to an older visible post", async () => {
    const visibleId = await seedVisiblePost();
    for (let index = 0; index < 11; index++) {
      const id = await seedActivity({
        authorId: OWNER,
        kind: "resource-published",
        entityId: `missing-resource-${index}`,
        label: "Published a resource",
        title: `Orphaned resource ${index}`,
        href: `/resources/missing-resource-${index}`,
        tags: [],
      });
      await activityRef(id).update({
        createdAt: Timestamp.fromMillis(BASE_MILLIS + index),
      });
    }
    const seen: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let exhausted = false;
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      const page = await getFeedPage(PEER, "all", cursor);
      seen.push(...page.posts.map((post) => post.id));
      expect(page.posts.every((post) => post.type !== "activity")).toBe(true);
      if (!page.nextCursor) {
        exhausted = true;
        break;
      }
      expect(cursors.has(page.nextCursor)).toBe(false);
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    expect(exhausted).toBe(true);
    expect(seen).toEqual([visibleId]);
  });
});
