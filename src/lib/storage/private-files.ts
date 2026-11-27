import "server-only";
import type { File } from "@google-cloud/storage";

/** Firebase bearer URLs bypass SDK rules. Remove their tokens before publication.
 * Callers must stop client updates with create-only upload reservations first.
 */
export async function removeStorageDownloadTokens(file: File) {
  const [before] = await file.getMetadata();
  await file.setMetadata(
    {
      cacheControl: "private, no-store",
      metadata: { firebaseStorageDownloadTokens: null },
    },
    {
      preconditionOpts: { ifMetagenerationMatch: before.metageneration },
    },
  );
  const [after] = await file.getMetadata();
  if (
    after.generation !== before.generation ||
    after.metadata?.firebaseStorageDownloadTokens
  )
    throw new Error("Storage token removal was not confirmed");
  return after;
}
