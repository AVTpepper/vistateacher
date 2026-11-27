import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { Timestamp } from "firebase-admin/firestore";
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
import * as provider from "@/lib/lessons/provider";
import { createMockLesson } from "@/lib/lessons/mock-provider";
import { lessonSourceSchema } from "@/schemas/lesson";
import {
  createLesson,
  createLessonBatch,
  getLesson,
  getLessonBatch,
  getLessonGenerationRequest,
  getLessonVersion,
  getLessonWorkspace,
  getSharedLesson,
  recoverStaleLessonGenerations,
  regenerateLesson,
  restoreLessonVersion,
  updateLesson,
  deleteLesson,
  duplicateLesson,
} from "@/lib/lessons/server";

let environment: RulesTestEnvironment;
const uid = "lesson-reliability-owner";
const source = lessonSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Local habitats",
  durationMinutes: 50,
  teachingStyle: "balanced",
  studentNeeds: "PRIVATE_LEARNER_CONTEXT",
  additionalInstructions: "PRIVATE_TEACHER_INSTRUCTIONS",
  language: "English",
});
const usageRef = () =>
  adminDb().doc(`usage/${uid}_${new Date().toISOString().slice(0, 7)}`);
const jobRef = (id: string) =>
  adminDb().doc(`lessonGenerationRequests/${uid}_${id}`);
async function cooldown() {
  await usageRef().set(
    { lastAiLessonAt: Timestamp.fromMillis(0) },
    { merge: true },
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function pending(id: string) {
  await vi.waitFor(async () =>
    expect((await jobRef(id).get()).data()?.status).toBe("pending"),
  );
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-vista-teacher",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  const db = adminDb();
  await db
    .doc(`users/${uid}`)
    .set({ status: "active", displayName: "Teacher", resourceCount: 0 });
  await db
    .doc("users/lesson-reliability-peer")
    .set({ status: "active", displayName: "Peer" });
  await db.doc(`subscriptions/${uid}`).set({ plan: "plus", status: "active" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await environment.clearFirestore();
});
afterAll(async () => {
  await environment.cleanup();
});

describe("durable lesson lifecycle", () => {
  it("allows only one worker/debit per UUID and replays completion before cooldown", async () => {
    const response = deferred<ReturnType<typeof createMockLesson>>();
    const generate = vi
      .spyOn(provider, "generateLessonPlan")
      .mockReturnValue(response.promise);
    const requestId = randomUUID();
    const first = createLesson(uid, source, requestId);
    await pending(requestId);
    await expect(createLesson(uid, source, requestId)).rejects.toMatchObject({
      code: "busy",
    });
    expect((await usageRef().get()).data()?.aiLessons).toBe(1);
    response.resolve(createMockLesson(source));
    const created = await first;
    expect((await createLesson(uid, source, requestId)).id).toBe(created.id);
    expect((await getLessonGenerationRequest(uid, requestId)).lesson?.id).toBe(
      created.id,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await usageRef().get()).data()?.aiLessons).toBe(1);
    await expect(
      createLesson(uid, { ...source, topic: "Different request" }, requestId),
    ).rejects.toMatchObject({ code: "conflict" });
    const client = environment.authenticatedContext(uid).firestore();
    await assertFails(
      getDoc(doc(client, "lessonGenerationRequests", `${uid}_${requestId}`)),
    );
  });

  it("preserves a committed lesson and debit after a lost commit acknowledgement", async () => {
    const db = adminDb();
    const requestId = randomUUID();
    const original = db.runTransaction.bind(db);
    let interrupted = false;
    vi.spyOn(db, "runTransaction").mockImplementation(
      async (update, options) => {
        const result = await original(update, options);
        if (
          !interrupted &&
          (await jobRef(requestId).get()).data()?.status === "complete"
        ) {
          interrupted = true;
          throw new Error("Commit acknowledgement lost");
        }
        return result;
      },
    );
    const created = await createLesson(uid, source, requestId);
    expect(interrupted).toBe(true);
    expect((await getLesson(uid, created.id)).currentVersion).toBe(1);
    expect((await usageRef().get()).data()?.aiLessons).toBe(1);
    expect((await jobRef(requestId).get()).data()?.status).toBe("complete");
  });

  it("refunds a failed attempt once and charges an explicit successful retry once", async () => {
    const generate = vi
      .spyOn(provider, "generateLessonPlan")
      .mockRejectedValueOnce(new Error("Provider unavailable"))
      .mockResolvedValue(createMockLesson(source));
    const requestId = randomUUID();
    await expect(createLesson(uid, source, requestId)).rejects.toMatchObject({
      code: "generation-failed",
    });
    expect((await usageRef().get()).data()?.aiLessons).toBe(0);
    await expect(createLesson(uid, source, requestId)).rejects.toMatchObject({
      code: "generation-failed",
    });
    expect(await recoverStaleLessonGenerations(uid)).toBe(0);
    await cooldown();
    const retryId = randomUUID();
    const created = await createLesson(uid, source, requestId, retryId);
    expect((await createLesson(uid, source, requestId, retryId)).id).toBe(
      created.id,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect((await usageRef().get()).data()?.aiLessons).toBe(1);
  });

  it("expires an abandoned worker and fences it from a newer retry", async () => {
    const oldResponse = deferred<ReturnType<typeof createMockLesson>>();
    vi.spyOn(provider, "generateLessonPlan")
      .mockReturnValueOnce(oldResponse.promise)
      .mockResolvedValue(createMockLesson(source));
    const requestId = randomUUID();
    const old = createLesson(uid, source, requestId);
    const oldOutcome = old.then(
      () => "unexpected",
      (error) => error.code,
    );
    await pending(requestId);
    await jobRef(requestId).update({ expiresAt: Timestamp.fromMillis(0) });
    expect(await recoverStaleLessonGenerations(uid)).toBe(1);
    expect(await recoverStaleLessonGenerations(uid)).toBe(0);
    expect((await usageRef().get()).data()?.aiLessons).toBe(0);
    await cooldown();
    const current = await createLesson(uid, source, requestId, randomUUID());
    oldResponse.resolve(createMockLesson(source));
    expect(await oldOutcome).toBe("conflict");
    expect((await getLesson(uid, current.id)).currentVersion).toBe(1);
    expect((await usageRef().get()).data()?.aiLessons).toBe(1);
    expect((await jobRef(requestId).get()).data()?.status).toBe("complete");
  });

  it("does not recreate a deleted draft when its worker finishes", async () => {
    const response = deferred<ReturnType<typeof createMockLesson>>();
    vi.spyOn(provider, "generateLessonPlan").mockReturnValue(response.promise);
    const requestId = randomUUID();
    const result = createLesson(uid, source, requestId).then(
      () => "unexpected",
      (error) => error.code,
    );
    await pending(requestId);
    const lessonId = (await jobRef(requestId).get()).data()!.lessonId;
    await deleteLesson(uid, lessonId);
    response.resolve(createMockLesson(source));
    expect(await result).toBe("not-found");
    expect((await adminDb().doc(`lessons/${lessonId}`).get()).exists).toBe(
      false,
    );
    expect((await usageRef().get()).data()?.aiLessons).toBe(0);
    await expect(
      createLesson(uid, source, requestId, randomUUID()),
    ).rejects.toMatchObject({ code: "generation-failed" });
  });

  it("rejects a completion after the account is disabled", async () => {
    const response = deferred<ReturnType<typeof createMockLesson>>();
    vi.spyOn(provider, "generateLessonPlan").mockReturnValue(response.promise);
    const requestId = randomUUID();
    const result = createLesson(uid, source, requestId).then(
      () => "unexpected",
      (error) => error.code,
    );
    await pending(requestId);
    await adminDb().doc(`users/${uid}`).update({ status: "deleting" });
    response.resolve(createMockLesson(source));
    expect(await result).toBe("inactive");
    expect((await usageRef().get()).data()?.aiLessons).toBe(0);
    expect(
      (await adminDb().collection("lessons").where("ownerId", "==", uid).get())
        .empty,
    ).toBe(true);
  });

  it("rejects stale saves and keeps corrected settings through regeneration", async () => {
    const created = await createLesson(uid, source);
    const corrected = {
      ...created.content,
      subject: "Music",
      gradeLevel: "Ages 8–10",
      durationMinutes: 45,
      mainActivity: {
        ...created.content.mainActivity,
        durationMinutes: created.content.mainActivity.durationMinutes - 5,
      },
    };
    const edited = await updateLesson(uid, created.id, corrected, undefined, 1);
    await expect(
      updateLesson(uid, created.id, created.content, "published", 1),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(edited.source).toMatchObject({
      subject: "Music",
      gradeLevel: "Ages 8–10",
      durationMinutes: 45,
    });
    await cooldown();
    const regenerated = await regenerateLesson(
      uid,
      created.id,
      undefined,
      undefined,
      undefined,
      { expectedVersion: 2, requestId: randomUUID() },
    );
    expect(regenerated.content).toMatchObject({
      subject: "Music",
      gradeLevel: "Ages 8–10",
      durationMinutes: 45,
    });
    expect(regenerated.currentVersion).toBe(3);
    expect(regenerated.sampleMode).toBe(true);
    await expect(
      updateLesson(
        uid,
        created.id,
        { ...corrected, durationMinutes: 60 },
        undefined,
        3,
      ),
    ).rejects.toMatchObject({ code: "invalid-content" });
  });

  it("restores private history as a free new version and preserves sample provenance", async () => {
    const created = await createLesson(uid, source);
    const edited = await updateLesson(
      uid,
      created.id,
      { ...created.content, title: "Teacher corrected title" },
      undefined,
      1,
    );
    expect((await getLessonVersion(uid, created.id, 1)).sampleMode).toBe(true);
    const restored = await restoreLessonVersion(
      uid,
      created.id,
      1,
      edited.currentVersion,
    );
    expect(restored).toMatchObject({
      currentVersion: 3,
      sampleMode: true,
      content: created.content,
    });
    expect(restored.versions[0].kind).toBe("restored");
    expect((await duplicateLesson(uid, created.id)).sampleMode).toBe(true);
    expect((await usageRef().get()).data()?.aiLessons).toBe(1);
    await expect(
      restoreLessonVersion(uid, created.id, 1, 2),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      getLessonVersion("lesson-reliability-peer", created.id, 1),
    ).rejects.toMatchObject({ code: "not-owner" });
    await updateLesson(uid, created.id, restored.content, "published", 3);
    const shared = await getSharedLesson(created.id, "lesson-reliability-peer");
    expect(JSON.stringify(shared)).not.toContain("PRIVATE_");
    expect(shared?.source.studentNeeds).toBe("");
  });

  it("exposes partial batch results and retries only failed items with an explicit identity", async () => {
    const generate = vi
      .spyOn(provider, "generateLessonPlan")
      .mockResolvedValueOnce(createMockLesson(source))
      .mockRejectedValueOnce(new Error("Second failed"))
      .mockResolvedValue(createMockLesson(source));
    const requestId = randomUUID();
    const first = await createLessonBatch(uid, source, 3, requestId);
    expect(first.lessons).toHaveLength(1);
    expect(first.items.map((item) => item.status)).toEqual([
      "complete",
      "not-started",
      "not-started",
    ]);
    const second = await createLessonBatch(uid, source, 3, requestId);
    expect(second.lessons[0].id).toBe(first.lessons[0].id);
    expect(second.items.map((item) => item.status)).toEqual([
      "complete",
      "failed",
      "not-started",
    ]);
    const third = await createLessonBatch(uid, source, 3, requestId);
    expect(third.lessons).toHaveLength(2);
    expect(third.status).toBe("partial");
    expect(
      (await createLessonBatch(uid, source, 3, requestId)).lessons,
    ).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(3);
    const retryId = randomUUID();
    const complete = await createLessonBatch(
      uid,
      source,
      3,
      requestId,
      retryId,
    );
    expect(complete.status).toBe("complete");
    expect(complete.lessons).toHaveLength(3);
    expect(
      (await createLessonBatch(uid, source, 3, requestId, retryId)).status,
    ).toBe("complete");
    expect(generate).toHaveBeenCalledTimes(4);
    expect((await usageRef().get()).data()?.aiLessons).toBe(3);
    expect((await getLessonBatch(uid, requestId)).lessons[0].id).toBe(
      first.lessons[0].id,
    );
    await expect(
      getLessonBatch("lesson-reliability-peer", requestId),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("does not charge a batch worker whose manifest claim expired before reservation", async () => {
    const db = adminDb();
    const requestId = randomUUID();
    const batchRef = db.doc(`lessonGenerationBatches/${uid}_${requestId}`);
    const reachedClaim = deferred<void>();
    const releaseOld = deferred<void>();
    const original = db.runTransaction.bind(db);
    const generate = vi
      .spyOn(provider, "generateLessonPlan")
      .mockResolvedValue(createMockLesson(source));
    let stopped = false;
    vi.spyOn(db, "runTransaction").mockImplementation(
      async (update, options) => {
        const result = await original(update, options);
        const claim = result as {
          index?: number;
          requestId?: string;
          status?: string;
        } | null;
        if (
          !stopped &&
          claim?.index === 0 &&
          claim.status === "pending" &&
          claim.requestId
        ) {
          stopped = true;
          reachedClaim.resolve();
          await releaseOld.promise;
        }
        return result;
      },
    );
    const oldWorker = createLessonBatch(uid, source, 2, requestId);
    await reachedClaim.promise;
    try {
      const stored = (await batchRef.get()).data()!;
      const oldRequestId = stored.items[0].requestId as string;
      await batchRef.update({
        items: stored.items.map(
          (item: Record<string, unknown>, index: number) =>
            index === 0
              ? { ...item, expiresAt: Timestamp.fromMillis(0) }
              : item,
        ),
      });
      expect((await getLessonBatch(uid, requestId)).items[0].status).toBe(
        "failed",
      );
      const retried = await createLessonBatch(
        uid,
        source,
        2,
        requestId,
        randomUUID(),
      );
      expect(retried.lessons).toHaveLength(1);
      releaseOld.resolve();
      const late = await oldWorker;
      expect(late.lessons.map((lesson) => lesson.id)).toEqual(
        retried.lessons.map((lesson) => lesson.id),
      );
      expect((await jobRef(oldRequestId).get()).exists).toBe(false);
      expect((await usageRef().get()).data()?.aiLessons).toBe(1);
      expect(
        (await db.collection("lessons").where("ownerId", "==", uid).get()).size,
      ).toBe(1);
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      releaseOld.resolve();
      await oldWorker;
    }
  });

  it("paginates an ordered workspace and rejects another teacher's cursor", async () => {
    const db = adminDb();
    const batch = db.batch();
    const content = createMockLesson(source);
    for (let index = 0; index < 23; index++)
      batch.set(db.doc(`lessons/page-${String(index).padStart(2, "0")}`), {
        ownerId: uid,
        source,
        content,
        currentVersion: 1,
        visibility: "draft",
        createdAt: Timestamp.fromMillis(index * 1000),
        updatedAt: Timestamp.fromMillis(index * 1000),
      });
    batch.set(db.doc("lessons/foreign-cursor"), {
      ownerId: "lesson-reliability-peer",
      source,
      content,
      updatedAt: Timestamp.now(),
    });
    await batch.commit();
    const first = await getLessonWorkspace(uid);
    expect(first.lessons).toHaveLength(20);
    expect(first.lessons[0].id).toBe("page-22");
    const next = await getLessonWorkspace(uid, first.nextCursor!);
    expect(next.lessons.map((lesson) => lesson.id)).toEqual([
      "page-02",
      "page-01",
      "page-00",
    ]);
    expect(next.nextCursor).toBeNull();
    await expect(
      getLessonWorkspace(uid, "foreign-cursor"),
    ).rejects.toMatchObject({ code: "invalid-cursor" });
  });

  it("unlocks legacy interrupted work without guessing a quota refund", async () => {
    const db = adminDb();
    await usageRef().set({ aiLessons: 2 });
    const legacy = {
      ownerId: uid,
      source,
      currentVersion: 1,
      generationStatus: "generating",
      updatedAt: Timestamp.fromMillis(0),
      createdAt: Timestamp.fromMillis(0),
    };
    await db
      .doc("lessons/legacy-saved")
      .set({ ...legacy, content: createMockLesson(source) });
    await db.doc("lessons/legacy-empty").set({ ...legacy, content: null });
    expect(await recoverStaleLessonGenerations(uid)).toBe(2);
    expect(
      (await db.doc("lessons/legacy-saved").get()).data()?.generationStatus,
    ).toBe("idle");
    expect((await db.doc("lessons/legacy-empty").get()).exists).toBe(false);
    expect((await usageRef().get()).data()?.aiLessons).toBe(2);
  });
});
