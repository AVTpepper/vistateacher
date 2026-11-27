import "server-only";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { readVisiblePost } from "@/lib/feed/server";
import type { Transaction } from "firebase-admin/firestore";
import {
  PostAttachmentError,
  type AttachmentRecord,
} from "@/lib/feed/attachment-server";
import {
  POST_FILE_MAX_SIZE,
  POST_FILE_MIME_TYPES,
} from "@/lib/feed/attachments";
import {
  attachmentDeliveryURL,
  attachmentIdFromURL,
  firebaseObjectURL,
  ownedPostObjectPath,
} from "@/lib/feed/media-paths";

type Media = {
  path: string;
  name: string;
  contentType: string;
  size: number;
  kind: "image" | "file";
  generation?: string;
};
async function activeViewer(uid: string | null, transaction: Transaction) {
  if (
    uid &&
    (await transaction.get(adminDb().doc(`users/${uid}`))).data()?.status !==
      "active"
  )
    throw new PostAttachmentError("inactive");
}
async function visiblePost(
  uid: string | null,
  postId: string,
  transaction: Transaction,
) {
  const post = await readVisiblePost(
    uid ?? "__anonymous__",
    postId,
    transaction,
  );
  if (!post) throw new PostAttachmentError("attachment-unavailable");
  return post;
}
async function readBytes(media: Media, recheck: () => Promise<void>) {
  const file = adminStorage().bucket().file(media.path);
  const [before] = await file.getMetadata();
  const allowedType =
    media.kind === "image"
      ? ["image/jpeg", "image/png", "image/webp"].includes(media.contentType)
      : POST_FILE_MIME_TYPES.includes(
          media.contentType as (typeof POST_FILE_MIME_TYPES)[number],
        );
  if (
    !allowedType ||
    before.contentType !== media.contentType ||
    Number(before.size) !== media.size ||
    media.size <= 0 ||
    media.size >
      (media.kind === "image" ? 10 * 1024 * 1024 : POST_FILE_MAX_SIZE) ||
    (media.generation && String(before.generation) !== media.generation)
  )
    throw new PostAttachmentError("attachment-unavailable");
  const [bytes] = await file.download();
  const [after] = await file.getMetadata();
  if (
    bytes.length !== media.size ||
    after.generation !== before.generation ||
    after.contentType !== before.contentType ||
    after.size !== before.size
  )
    throw new PostAttachmentError("attachment-unavailable");
  await recheck(); // No bytes leave this process until the current parent policy wins.
  return {
    bytes,
    name: media.name,
    contentType: media.contentType,
    inline: media.kind === "image",
  };
}
export async function deliverPostAttachment(uid: string | null, id: string) {
  if (attachmentIdFromURL(`/api/feed/attachments/${id}`) !== id)
    throw new PostAttachmentError("attachment-unavailable");
  const ref = adminDb().doc(`postAttachments/${id}`),
    initial = await ref.get();
  const media = initial.data() as AttachmentRecord | undefined;
  if (
    !media ||
    !["ready", "attached"].includes(media.state) ||
    !ownedPostObjectPath(media.path, media.ownerId) ||
    !media.generation
  )
    throw new PostAttachmentError("attachment-unavailable");
  if (!uid && media.kind !== "image")
    throw new PostAttachmentError("attachment-unavailable");
  const url = attachmentDeliveryURL(id);
  async function authorize() {
    await adminDb().runTransaction(async (transaction) => {
      await activeViewer(uid, transaction);
      const current = await transaction.get(ref);
      for (const key of [
        "ownerId",
        "path",
        "name",
        "contentType",
        "size",
        "kind",
        "state",
        "postId",
        "generation",
      ] as const)
        if (current.data()?.[key] !== media![key])
          throw new PostAttachmentError("attachment-unavailable");
      if (media!.state === "ready") {
        if (uid !== media!.ownerId)
          throw new PostAttachmentError("attachment-unavailable");
        return;
      }
      if (!media!.postId)
        throw new PostAttachmentError("attachment-unavailable");
      const post = await visiblePost(uid, media!.postId, transaction);
      const data = post.data()!;
      if (
        data.authorId !== media!.ownerId ||
        !(media!.kind === "image"
          ? data.imageURLs?.includes(url)
          : data.fileAttachments?.some(
              (item: { url?: string }) => item.url === url,
            ))
      )
        throw new PostAttachmentError("attachment-unavailable");
    });
  }
  await authorize();
  return readBytes(media, authorize);
}
export async function deliverLegacyPostMedia(
  uid: string | null,
  postId: string,
  kind: "image" | "file",
  slot: number,
) {
  if (
    !/^[\w-]{1,128}$/u.test(postId) ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot > 3 ||
    (!uid && kind !== "image")
  )
    throw new PostAttachmentError("attachment-unavailable");
  const post = await adminDb().runTransaction(async (transaction) => {
    await activeViewer(uid, transaction);
    return visiblePost(uid, postId, transaction);
  });
  const data = post.data()!;
  const value =
    kind === "image"
      ? data.imageURLs?.[slot]
      : data.fileAttachments?.[slot]?.url;
  if (typeof value !== "string")
    throw new PostAttachmentError("attachment-unavailable");
  const parsed = firebaseObjectURL(
    value,
    adminStorage().bucket().name,
    process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  );
  if (!parsed?.path || !ownedPostObjectPath(parsed.path, data.authorId))
    throw new PostAttachmentError("attachment-unavailable");
  const [metadata] = await adminStorage()
    .bucket()
    .file(parsed.path)
    .getMetadata();
  const media: Media = {
    path: parsed.path,
    name:
      kind === "file" ? String(data.fileAttachments[slot].name) : "post-image",
    kind,
    contentType: String(metadata.contentType ?? ""),
    size: Number(metadata.size),
    generation: String(metadata.generation ?? ""),
  };
  return readBytes(media, async () => {
    await adminDb().runTransaction(async (transaction) => {
      await activeViewer(uid, transaction);
      const current = await visiblePost(uid, postId, transaction),
        currentData = current.data()!;
      const currentValue =
        kind === "image"
          ? currentData.imageURLs?.[slot]
          : currentData.fileAttachments?.[slot]?.url;
      if (currentData.authorId !== data.authorId || currentValue !== value)
        throw new PostAttachmentError("attachment-unavailable");
    });
  });
}
