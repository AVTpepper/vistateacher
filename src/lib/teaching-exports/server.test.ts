// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { createMemoryFirestore } from "../../../tests/memory-firestore";
import { createMockLesson } from "@/lib/lessons/mock-provider";
import { lessonSourceSchema } from "@/schemas/lesson";
import { worksheetSourceSchema } from "@/schemas/worksheet";
import { createMockWorksheet } from "@/lib/worksheets/mock-provider";
import {
  createTeachingExport,
  getTeachingExport,
  getTeachingExportBytes,
  claimTeachingExport,
  mutateTeachingExport,
  publishTeachingExport,
} from "./server";
import type {
  TeachingExportCreate,
  TeachingExportPublish,
} from "@/schemas/teaching-export";

const db = createMemoryFirestore();
const source = lessonSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Food webs",
  durationMinutes: 45,
  teachingStyle: "balanced",
  studentNeeds: "PRIVATE STUDENT NEEDS",
  additionalInstructions: "PRIVATE BRIEF",
  language: "English",
});
const input: TeachingExportCreate = {
  kind: "lesson",
  sourceId: "owned",
  version: 1,
  mode: "student",
  destination: {
    id: "drive-account",
    email: "teacher@example.com",
    name: "Teacher",
  },
};
const uri =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=saved-session";
const document = {
  id: "google-doc",
  url: "https://docs.google.com/document/d/google-doc/edit",
  title: "My document",
};
const save = vi.fn(async () => undefined);
const cancel = vi.fn(async () => undefined);
const reserve = vi.fn(async () => ({
  resourceId: "copy",
  uploadPath: "resource.docx",
  state: "uploading",
}));
const finalize = vi.fn(
  async (
    _uid: string,
    resourceId: string,
    hooks: {
      beforeCommit: (tx: unknown) => Promise<void>;
      onCommit: (tx: unknown, resourceId: string) => void;
    },
  ) => {
    await db.runTransaction(async (tx) => {
      await hooks.beforeCommit(tx);
      tx.set(db.doc(`resources/${resourceId}`), {
        status: "active",
        authorId: "owner",
      });
      hooks.onCommit(tx, resourceId);
    });
  },
);
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => db }));
vi.mock("@/lib/documents/docx", () => ({
  createTeachingDocx: async (projection: unknown) =>
    Buffer.from(JSON.stringify(projection)),
  safeDocumentName: () => "teaching-resource",
}));
vi.mock("@/lib/resources/server", () => ({
  drainGeneratedResourceCleanup: async () => 0,
  reserveGeneratedResource: (...args: unknown[]) => reserve(...(args as [])),
  saveGeneratedResourceBytes: (...args: unknown[]) => save(...(args as [])),
  finalizeResourceUpload: (...args: Parameters<typeof finalize>) =>
    finalize(...args),
  cancelResourceUpload: (...args: unknown[]) => cancel(...(args as [])),
}));
beforeEach(() => {
  db.documents.clear();
  vi.clearAllMocks();
  db.documents.set("users/owner", { status: "active" });
  db.documents.set("users/peer", { status: "active" });
  db.documents.set("lessons/owned", {
    ownerId: "owner",
    content: createMockLesson(source),
    source,
    currentVersion: 1,
    generationStatus: "idle",
  });
});
async function completed() {
  const job = await createTeachingExport("owner", input);
  const { claim } = await claimTeachingExport("owner", job.id);
  await mutateTeachingExport("owner", job.id, {
    action: "session",
    claim: claim!,
    uri,
  });
  return mutateTeachingExport("owner", job.id, {
    action: "complete",
    claim: claim!,
    document,
  });
}
it("freezes one private projection under concurrent creation and preserves its bytes after later edits", async () => {
  const [a, b] = await Promise.all([
    createTeachingExport("owner", input),
    createTeachingExport("owner", input),
  ]);
  expect(a.id).toBe(b.id);
  expect(db.documents.get("users/owner/exportState/limits")?.snapshots).toBe(1);
  const saved = await getTeachingExportBytes("owner", a.id);
  expect(saved.bytes.toString()).not.toContain("PRIVATE");
  const original = db.documents.get("lessons/owned")!;
  db.documents.set("lessons/owned", {
    ...original,
    currentVersion: 2,
    content: { ...(original.content as object), title: "Later edit" },
  });
  expect(await createTeachingExport("owner", input)).toEqual(a);
  expect((await getTeachingExportBytes("owner", a.id)).bytes).toEqual(
    saved.bytes,
  );
  expect(a).not.toHaveProperty("bytes");
  expect(a).not.toHaveProperty("claim");
});
it("binds destination, mode and version, rejects stale new snapshots and inactive or other owners", async () => {
  const a = await createTeachingExport("owner", input);
  const b = await createTeachingExport("owner", {
    ...input,
    destination: { ...input.destination, id: "other-drive" },
  });
  expect(b.id).not.toBe(a.id);
  await expect(
    createTeachingExport("owner", { ...input, version: 2 }),
  ).rejects.toMatchObject({ code: "conflict" });
  await expect(createTeachingExport("peer", input)).rejects.toMatchObject({
    code: "not-found",
  });
  await expect(getTeachingExportBytes("peer", a.id)).rejects.toMatchObject({
    code: "not-found",
  });
  db.documents.set("users/owner", { status: "suspended" });
  await expect(getTeachingExport("owner", a.id)).rejects.toMatchObject({
    code: "inactive",
  });
});
it("bounds private storage while keeping existing exports reusable", async () => {
  const job = await createTeachingExport("owner", input);
  db.documents.set("users/owner/exportState/limits", { snapshots: 100 });
  expect((await createTeachingExport("owner", input)).id).toBe(job.id);
  await expect(
    createTeachingExport("owner", {
      ...input,
      destination: { ...input.destination, id: "new-drive" },
    }),
  ).rejects.toMatchObject({ code: "snapshot-limit" });
});
it("fences overlapping tabs and resumes the same stored session after lease expiry", async () => {
  const job = await createTeachingExport("owner", input);
  const start = Date.now();
  const first = await claimTeachingExport("owner", job.id, start);
  await expect(
    claimTeachingExport("owner", job.id, start + 1),
  ).rejects.toMatchObject({ code: "busy" });
  await mutateTeachingExport(
    "owner",
    job.id,
    { action: "session", claim: first.claim!, uri },
    start + 2,
  );
  const second = await claimTeachingExport("owner", job.id, start + 300001);
  expect(second.job.uploadSessionUri).toBe(uri);
  await expect(
    mutateTeachingExport(
      "owner",
      job.id,
      { action: "complete", claim: first.claim!, document },
      start + 300002,
    ),
  ).rejects.toMatchObject({ code: "conflict" });
  await expect(
    mutateTeachingExport(
      "owner",
      job.id,
      { action: "release", claim: first.claim! },
      start + 300002,
    ),
  ).rejects.toMatchObject({ code: "conflict" });
  await expect(
    mutateTeachingExport(
      "owner",
      job.id,
      {
        action: "session",
        claim: second.claim!,
        uri: uri.replace("saved-session", "changed"),
      },
      start + 300002,
    ),
  ).rejects.toMatchObject({ code: "conflict" });
});
it("recovers a lost completion response and requires explicit compare-and-swap before another copy", async () => {
  const job = await createTeachingExport("owner", input);
  const { claim } = await claimTeachingExport("owner", job.id);
  await expect(
    mutateTeachingExport("owner", job.id, {
      action: "complete",
      claim: claim!,
      document,
    }),
  ).rejects.toMatchObject({ code: "not-ready" });
  await mutateTeachingExport("owner", job.id, {
    action: "session",
    claim: claim!,
    uri,
  });
  const first = await mutateTeachingExport("owner", job.id, {
    action: "complete",
    claim: claim!,
    document,
  });
  expect(
    await mutateTeachingExport("owner", job.id, {
      action: "complete",
      claim: claim!,
      document,
    }),
  ).toEqual(first);
  expect((await claimTeachingExport("owner", job.id)).claim).toBeNull();
  await expect(
    mutateTeachingExport("owner", job.id, {
      action: "restart",
      expectedDocumentId: "stale",
      expectedSessionUri: uri,
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  expect(
    (
      await mutateTeachingExport("owner", job.id, {
        action: "restart",
        expectedDocumentId: document.id,
        expectedSessionUri: uri,
      })
    ).state,
  ).toBe("ready");
});
it("denies unsafe URIs, arbitrary Google links and additional credential fields", async () => {
  const job = await createTeachingExport("owner", input);
  const { claim } = await claimTeachingExport("owner", job.id);
  await expect(
    mutateTeachingExport("owner", job.id, {
      action: "session",
      claim: claim!,
      uri: "https://evil.example/upload",
    }),
  ).rejects.toThrow();
  await expect(
    mutateTeachingExport("owner", job.id, {
      action: "complete",
      claim: claim!,
      document: { ...document, url: "https://evil.example" },
    }),
  ).rejects.toThrow();
  await expect(
    createTeachingExport("owner", {
      ...input,
      accessToken: "never-store",
    } as TeachingExportCreate),
  ).rejects.toThrow();
});
it("projects questions and answer keys separately, excluding private worksheet reference and brief", async () => {
  const brief = worksheetSourceSchema.parse({
    ...source,
    difficulty: "core",
    questionCounts: {
      multipleChoice: 1,
      shortAnswer: 0,
      extendedResponse: 0,
      matching: 0,
      fillInBlank: 0,
      trueFalse: 0,
    },
  });
  const content = createMockWorksheet(brief);
  const answer = content.answerKey[0];
  if (!("explanation" in answer))
    throw new Error("Expected a multiple-choice answer");
  answer.explanation = "TEACHER KEY SECRET";
  db.documents.set("worksheets/owned", {
    ownerId: "owner",
    source: brief,
    content,
    reference: { lessonId: "PRIVATE_REFERENCE" },
    currentVersion: 1,
  });
  const student = await createTeachingExport("owner", {
    ...input,
    kind: "worksheet",
  });
  const key = await createTeachingExport("owner", {
    ...input,
    kind: "worksheet",
    mode: "key",
  });
  const studentBytes = (
    await getTeachingExportBytes("owner", student.id)
  ).bytes.toString();
  const keyBytes = (
    await getTeachingExportBytes("owner", key.id)
  ).bytes.toString();
  expect(studentBytes).not.toContain("TEACHER KEY SECRET");
  expect(keyBytes).toContain("TEACHER KEY SECRET");
  expect(studentBytes + keyBytes).not.toContain("PRIVATE");
});
it("publishes server-owned bytes once, atomically records success and never resurrects withdrawn copies", async () => {
  const job = await completed();
  const input: TeachingExportPublish = {
    publicationId: randomUUID(),
    metadata: job.defaults,
  };
  expect(await publishTeachingExport("owner", job.id, input)).toEqual({
    resourceId: "copy",
  });
  expect(save).toHaveBeenCalledWith(
    "owner",
    "copy",
    (await getTeachingExportBytes("owner", job.id)).bytes,
  );
  expect(
    await publishTeachingExport("owner", job.id, {
      ...input,
      publicationId: randomUUID(),
    }),
  ).toEqual({ resourceId: "copy" });
  expect(reserve).toHaveBeenCalledTimes(1);
  expect((await getTeachingExport("owner", job.id)).publication?.state).toBe(
    "complete",
  );
  db.documents.delete("resources/copy");
  await expect(
    publishTeachingExport("owner", job.id, input),
  ).rejects.toMatchObject({ code: "withdrawn" });
  expect(reserve).toHaveBeenCalledTimes(1);
});
it("keeps private Docs success after a publishing failure and retries frozen metadata", async () => {
  const job = await completed();
  const input = { publicationId: randomUUID(), metadata: job.defaults };
  save.mockRejectedValueOnce(new Error("storage temporarily unavailable"));
  await expect(publishTeachingExport("owner", job.id, input)).rejects.toThrow(
    "storage temporarily unavailable",
  );
  expect((await getTeachingExport("owner", job.id)).state).toBe("complete");
  await expect(
    publishTeachingExport("owner", job.id, {
      ...input,
      metadata: { ...input.metadata, title: "Changed after upload" },
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  expect(await publishTeachingExport("owner", job.id, input)).toEqual({
    resourceId: "copy",
  });
});
it("resumes reviewed metadata when Firestore returns map fields in a different order", async () => {
  const job = await completed();
  const publicationId = randomUUID();
  const path = `users/owner/teachingExports/${job.id}`;
  const record = db.documents.get(path)!;
  db.documents.set(path, {
    ...record,
    publication: {
      publicationId,
      state: "pending",
      resourceId: null,
      claim: null,
      leaseUntil: null,
      metadata: Object.fromEntries(Object.entries(job.defaults).reverse()),
    },
  });
  expect(
    await publishTeachingExport("owner", job.id, {
      publicationId,
      metadata: job.defaults,
    }),
  ).toEqual({ resourceId: "copy" });
});
it("does not finalize after the source is deleted during file transfer", async () => {
  const job = await completed();
  save.mockImplementationOnce(async () => {
    db.documents.delete("lessons/owned");
  });
  await expect(
    publishTeachingExport("owner", job.id, {
      publicationId: randomUUID(),
      metadata: job.defaults,
    }),
  ).rejects.toMatchObject({ code: "not-found" });
  expect(db.documents.has("resources/copy")).toBe(false);
  expect(cancel).toHaveBeenCalledWith("owner", "copy");
  await expect(getTeachingExportBytes("owner", job.id)).rejects.toMatchObject({
    code: "not-found",
  });
});
