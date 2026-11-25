import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { createTeachingDocx, safeDocumentName } from "@/lib/documents/docx";
import { lessonDocument } from "@/lib/lessons/document";
import { worksheetDocument } from "@/lib/worksheets/document";
import { validateWorksheetContent } from "@/lib/worksheets/validation";
import { lessonPlanSchema } from "@/schemas/lesson";
import {
  teachingExportCreateSchema,
  teachingExportIdSchema,
  teachingExportMutationSchema,
  teachingExportPublishSchema,
  type TeachingExportCreate,
  type TeachingExportMutation,
  type TeachingExportPublish,
  type TeachingExportJob,
} from "@/schemas/teaching-export";
import {
  reserveGeneratedResource,
  saveGeneratedResourceBytes,
  finalizeResourceUpload,
  cancelResourceUpload,
  drainGeneratedResourceCleanup,
} from "@/lib/resources/server";

const MAX_BYTES = 900 * 1024;
const MAX_SNAPSHOTS = 100;
const LEASE_MS = 5 * 60 * 1000;
type Data = FirebaseFirestore.DocumentData;
export class TeachingExportError extends Error {
  constructor(
    public readonly code:
      | "inactive"
      | "not-found"
      | "conflict"
      | "busy"
      | "too-large"
      | "snapshot-limit"
      | "not-ready"
      | "withdrawn",
    message?: string,
  ) {
    super(message ?? code);
  }
}
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const limitsRef = (uid: string) =>
  adminDb().doc(`users/${uid}/exportState/limits`);
const jobRef = (uid: string, id: string) =>
  adminDb().doc(
    `users/${uid}/teachingExports/${teachingExportIdSchema.parse(id)}`,
  );
const sourceRef = (kind: string, id: string) =>
  adminDb().doc(`${kind === "lesson" ? "lessons" : "worksheets"}/${id}`);
function checkSource(data: Data | undefined, uid: string) {
  if (!data?.content || data.ownerId !== uid)
    throw new TeachingExportError("not-found");
}
function active(data: Data | undefined) {
  if (data?.status !== "active") throw new TeachingExportError("inactive");
}
function dto(id: string, data: Data): TeachingExportJob {
  // Explicit projection: binary and lease credentials never enter page data.
  return {
    id,
    title: data.title,
    version: data.version,
    mode: data.mode,
    byteLength: data.byteLength,
    binaryHash: data.binaryHash,
    sourceFingerprint: data.sourceFingerprint,
    state: data.state,
    document: data.document ?? null,
    uploadSessionUri: data.uploadSessionUri ?? null,
    destination: data.destination,
    defaults: data.defaults,
    publication: data.publication
      ? {
          publicationId: data.publication.publicationId,
          metadata: data.publication.metadata,
          resourceId: data.publication.resourceId ?? null,
          state: data.publication.state,
        }
      : null,
  };
}
async function authorized(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  id: string,
) {
  const ref = jobRef(uid, id);
  const [user, job] = await tx.getAll(adminDb().doc(`users/${uid}`), ref);
  active(user.data());
  const data = job.data();
  if (!data || data.ownerId !== uid) throw new TeachingExportError("not-found");
  const source = await tx.get(sourceRef(data.kind, data.sourceId));
  checkSource(source.data(), uid);
  return { ref, data };
}
function assertClaim(data: Data, claim: string, now: number) {
  if (
    data.claim !== claim ||
    !(data.leaseUntil instanceof Timestamp) ||
    data.leaseUntil.toMillis() <= now
  )
    throw new TeachingExportError(
      "conflict",
      "This export was resumed elsewhere. Reopen it to continue.",
    );
}
function held(data: Data, now: number) {
  return (
    typeof data.claim === "string" &&
    data.leaseUntil instanceof Timestamp &&
    data.leaseUntil.toMillis() > now
  );
}

/** Freeze only the public document projection; never copy the private brief. */
export async function createTeachingExport(
  uid: string,
  raw: TeachingExportCreate,
): Promise<TeachingExportJob> {
  const input = teachingExportCreateSchema.parse(raw);
  const id = hash(
    JSON.stringify([
      uid,
      input.kind,
      input.sourceId,
      input.version,
      input.mode,
      input.destination.id,
    ]),
  );
  const db = adminDb();
  const ref = jobRef(uid, id);
  const source = sourceRef(input.kind, input.sourceId);
  const [user, original, existing] = await db.getAll(
    db.doc(`users/${uid}`),
    source,
    ref,
  );
  active(user.data());
  checkSource(original.data(), uid);
  await drainGeneratedResourceCleanup(uid);
  if (existing.exists) return getTeachingExport(uid, id);
  const data = original.data()!;
  if (
    data.currentVersion !== input.version ||
    data.generationStatus === "generating"
  )
    throw new TeachingExportError(
      "conflict",
      "Save and reload the current version before exporting.",
    );
  const document =
    input.kind === "lesson"
      ? lessonDocument(lessonPlanSchema.parse(data.content))
      : worksheetDocument(validateWorksheetContent(data.content), input.mode);
  const bytes = Buffer.from(await createTeachingDocx(document));
  if (bytes.length > MAX_BYTES) throw new TeachingExportError("too-large");
  const sourceState = JSON.stringify([
    data.currentVersion,
    data.content,
    data.source?.language ?? "",
    data.sampleMode === true,
  ]);
  const title = document.title;
  const defaults = {
    title: title.slice(0, 140),
    description:
      `${input.kind === "lesson" ? "Lesson plan" : input.mode === "key" ? "Worksheet answer key" : "Student worksheet"}: ${title}. Saved version ${input.version}${data.sampleMode === true ? ". Created in sample mode; review before classroom use." : ". Review and adapt for your class."}`.slice(
        0,
        2000,
      ),
    type: input.kind === "lesson" ? "lesson-plan" : "worksheet",
    subject: String(data.content.subject).slice(0, 60),
    gradeLevel: String(data.content.gradeLevel).slice(0, 60),
    tags: [],
    accessTier: "free",
  };
  return db.runTransaction(async (tx) => {
    const [currentUser, current, job, limits] = await tx.getAll(
      db.doc(`users/${uid}`),
      source,
      ref,
      limitsRef(uid),
    );
    active(currentUser.data());
    checkSource(current.data(), uid);
    if (job.exists) return dto(id, job.data()!);
    const latest = current.data()!;
    if (
      latest.generationStatus === "generating" ||
      JSON.stringify([
        latest.currentVersion,
        latest.content,
        latest.source?.language ?? "",
        latest.sampleMode === true,
      ]) !== sourceState
    )
      throw new TeachingExportError(
        "conflict",
        "The saved content changed. Reload before exporting.",
      );
    const count = Number(limits.data()?.snapshots ?? 0);
    if (count >= MAX_SNAPSHOTS) throw new TeachingExportError("snapshot-limit");
    const record = {
      ownerId: uid,
      kind: input.kind,
      sourceId: input.sourceId,
      version: input.version,
      mode: input.mode,
      title,
      fileName: `${safeDocumentName(title)}.docx`,
      destination: input.destination,
      sourceFingerprint: hash(
        JSON.stringify([document, data.source?.language ?? "", input.mode]),
      ),
      binaryHash: hash(bytes),
      byteLength: bytes.length,
      bytes,
      defaults,
      state: "ready",
      document: null,
      uploadSessionUri: null,
      claim: null,
      leaseUntil: null,
      publication: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, record);
    tx.set(limitsRef(uid), { snapshots: count + 1 });
    return dto(id, record);
  });
}
export async function getTeachingExport(
  uid: string,
  id: string,
): Promise<TeachingExportJob> {
  return adminDb().runTransaction(async (tx) => {
    const result = dto(id, (await authorized(tx, uid, id)).data);
    if (
      result.publication?.state === "complete" &&
      result.publication.resourceId
    ) {
      const resource = await tx.get(
        adminDb().doc(`resources/${result.publication.resourceId}`),
      );
      result.publication.available =
        resource.exists && resource.data()?.status === "active";
    }
    return result;
  });
}
export async function getTeachingExportBytes(uid: string, id: string) {
  return adminDb().runTransaction(async (tx) => {
    const { data } = await authorized(tx, uid, id);
    const bytes = Buffer.from(data.bytes);
    if (bytes.length !== data.byteLength || hash(bytes) !== data.binaryHash)
      throw new TeachingExportError("not-ready");
    return {
      bytes,
      fileName: String(data.fileName),
      hash: String(data.binaryHash),
    };
  });
}
export async function claimTeachingExport(
  uid: string,
  id: string,
  now = Date.now(),
) {
  const claim = randomUUID();
  return adminDb().runTransaction(async (tx) => {
    const { ref, data } = await authorized(tx, uid, id);
    if (data.state === "complete") return { job: dto(id, data), claim: null };
    if (held(data, now)) throw new TeachingExportError("busy");
    tx.update(ref, {
      claim,
      leaseUntil: Timestamp.fromMillis(now + LEASE_MS),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { job: dto(id, data), claim };
  });
}
export async function mutateTeachingExport(
  uid: string,
  id: string,
  raw: TeachingExportMutation,
  now = Date.now(),
) {
  const input = teachingExportMutationSchema.parse(raw);
  return adminDb().runTransaction(async (tx) => {
    const { ref, data } = await authorized(tx, uid, id);
    let patch: Data;
    if (input.action === "restart") {
      if (
        held(data, now) ||
        (data.publication?.state === "pending" && held(data.publication, now))
      )
        throw new TeachingExportError("busy");
      if (
        (data.document?.id ?? null) !== input.expectedDocumentId ||
        (data.uploadSessionUri ?? null) !== input.expectedSessionUri
      )
        throw new TeachingExportError("conflict");
      patch = {
        state: "ready",
        document: null,
        uploadSessionUri: null,
        claim: null,
        leaseUntil: null,
      };
    } else {
      // Lost completion responses may retry after the fence was cleared.
      if (
        input.action === "complete" &&
        data.state === "complete" &&
        data.completedClaim === input.claim &&
        data.document?.id === input.document.id
      )
        return dto(id, data);
      assertClaim(data, input.claim, now);
      if (input.action === "release") patch = { claim: null, leaseUntil: null };
      else if (input.action === "session") {
        if (
          data.state === "complete" ||
          (data.uploadSessionUri && data.uploadSessionUri !== input.uri)
        )
          throw new TeachingExportError("conflict");
        patch = { uploadSessionUri: input.uri, state: "uploading" };
      } else {
        if (!data.uploadSessionUri) throw new TeachingExportError("not-ready");
        patch = {
          document: input.document,
          state: "complete",
          completedClaim: input.claim,
          claim: null,
          leaseUntil: null,
        };
      }
    }
    tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    return dto(id, { ...data, ...patch });
  });
}

/** Publishing always uses server-owned bytes, independently of private Drive edits. */
export async function publishTeachingExport(
  uid: string,
  id: string,
  raw: TeachingExportPublish,
  now = Date.now(),
) {
  const input = teachingExportPublishSchema.parse(raw);
  const db = adminDb();
  const fence = randomUUID();
  const prepared = await db.runTransaction(async (tx) => {
    const { ref, data } = await authorized(tx, uid, id);
    if (data.state !== "complete") throw new TeachingExportError("not-ready");
    if (
      input.metadata.type !==
      (data.kind === "lesson" ? "lesson-plan" : "worksheet")
    )
      throw new TeachingExportError("conflict");
    const previous = data.publication;
    if (previous?.state === "complete") {
      const resource = await tx.get(db.doc(`resources/${previous.resourceId}`));
      if (!resource.exists || resource.data()?.status !== "active")
        throw new TeachingExportError("withdrawn");
      return { data, publication: previous, done: true };
    }
    if (
      previous &&
      JSON.stringify(
        teachingExportPublishSchema.shape.metadata.parse(previous.metadata),
      ) !== JSON.stringify(input.metadata)
    )
      throw new TeachingExportError(
        "conflict",
        "Publishing has already started with the reviewed details. Retry those details.",
      );
    if (previous && held(previous, now)) throw new TeachingExportError("busy");
    const publication = {
      publicationId: previous?.publicationId ?? input.publicationId,
      metadata: previous?.metadata ?? input.metadata,
      resourceId: previous?.resourceId ?? null,
      state: "pending",
      claim: fence,
      leaseUntil: Timestamp.fromMillis(now + LEASE_MS),
    };
    tx.update(ref, { publication, updatedAt: FieldValue.serverTimestamp() });
    return { data, publication, done: false };
  });
  if (prepared.done)
    return { resourceId: String(prepared.publication.resourceId) };
  let resourceId: string | null = null;
  try {
    const reservation = await reserveGeneratedResource(
      uid,
      {
        publicationId: hash(`${id}_${prepared.publication.publicationId}`),
        metadata: prepared.publication.metadata,
        bytesHash: prepared.data.binaryHash,
        byteLength: prepared.data.byteLength,
      },
      {
        beforeCommit: async (tx) => {
          const { data } = await authorized(tx, uid, id);
          assertClaim(data.publication ?? {}, fence, Date.now());
        },
        onCommit: (tx, reservedId) => {
          tx.update(jobRef(uid, id), {
            publication: { ...prepared.publication, resourceId: reservedId },
          });
        },
      },
    );
    resourceId = reservation.resourceId;
    if (reservation.state === "uploading")
      await saveGeneratedResourceBytes(
        uid,
        resourceId,
        Buffer.from(prepared.data.bytes),
      );
    await finalizeResourceUpload(uid, resourceId, {
      beforeCommit: async (tx) => {
        const { data } = await authorized(tx, uid, id);
        assertClaim(data.publication ?? {}, fence, Date.now());
      },
      onCommit: (tx) => {
        tx.update(jobRef(uid, id), {
          publication: {
            publicationId: prepared.publication.publicationId,
            metadata: prepared.publication.metadata,
            resourceId,
            state: "complete",
            claim: null,
            leaseUntil: null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });
      },
    });
    return { resourceId };
  } catch (error) {
    if (
      resourceId &&
      error instanceof TeachingExportError &&
      (error.code === "not-found" || error.code === "inactive")
    )
      await cancelResourceUpload(uid, resourceId).catch(() => undefined);
    // Release only our own claim; a newer worker must retain its fence.
    await db.runTransaction(async (tx) => {
      const ref = jobRef(uid, id);
      const job = await tx.get(ref);
      const publication = job.data()?.publication;
      if (publication?.claim === fence)
        tx.update(ref, {
          publication: {
            ...publication,
            resourceId,
            claim: null,
            leaseUntil: null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });
    });
    throw error;
  }
}
