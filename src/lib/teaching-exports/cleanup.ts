import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import {
  cancelResourceUpload,
  drainGeneratedResourceCleanup,
  ResourceActionError,
} from "@/lib/resources/server";

/** Source deletion revokes all pending jobs. Published copies are independent. */
export async function deleteTeachingExports(
  uid: string,
  kind: "lesson" | "worksheet",
  sourceId: string,
) {
  const db = adminDb();
  await drainGeneratedResourceCleanup(uid);
  const collection = db.collection(`users/${uid}/teachingExports`);
  for (;;) {
    const pending = await collection
      .where("kind", "==", kind)
      .where("sourceId", "==", sourceId)
      .limit(10)
      .get();
    if (pending.empty) return;
    // A cancellation must finish or leave a durable cleanup receipt before the
    // snapshot is discarded. Completed community resources are independent.
    for (const job of pending.docs) {
      const publication = job.data().publication;
      if (publication?.state === "pending" && publication.resourceId) {
        try {
          await cancelResourceUpload(uid, String(publication.resourceId));
        } catch (error) {
          if (
            !(error instanceof ResourceActionError) ||
            !["not-found", "not-ready"].includes(error.code)
          )
            throw error;
        }
      }
    }
    const removed = await db.runTransaction(async (tx) => {
      const [jobs, limits] = await Promise.all([
        tx.getAll(...pending.docs.map((job) => job.ref)),
        tx.get(db.doc(`users/${uid}/exportState/limits`)),
      ]);
      const existing = jobs.filter((job) => job.exists);
      if (!existing.length) return true;
      for (const job of existing) tx.delete(job.ref);
      tx.set(limits.ref, {
        snapshots: Math.max(
          0,
          Number(limits.data()?.snapshots ?? 0) - existing.length,
        ),
      });
      return true;
    });
    if (!removed) return;
  }
}
