import "server-only";
import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import {
  POST_FILE_MAX_SIZE,
  POST_FILE_MIME_TYPES,
  postFileContentType,
} from "@/lib/feed/attachments";
import {
  attachmentDeliveryURL,
  attachmentIdFromURL,
  firebaseObjectURL,
  legacyMediaSlot,
  legacyMediaURL,
  ownedPostObjectPath,
} from "@/lib/feed/media-paths";
import { removeStorageDownloadTokens } from "@/lib/storage/private-files";
import type { PostFileAttachment } from "@/schemas/feed";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const name = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((value) => !/[\\/\u0000-\u001f]/u.test(value));
export const reservePostAttachmentSchema = z
  .object({
    kind: z.enum(["image", "file"]),
    name,
    contentType: z.enum([...IMAGE_TYPES, ...POST_FILE_MIME_TYPES]),
    size: z.number().int().positive().max(POST_FILE_MAX_SIZE),
  })
  .superRefine((input, context) => {
    if (
      input.kind === "image"
        ? !IMAGE_TYPES.includes(
            input.contentType as (typeof IMAGE_TYPES)[number],
          ) || input.size > 10 * 1024 * 1024
        : postFileContentType(input.name) !== input.contentType
    )
      context.addIssue({
        code: "custom",
        message: "Choose a supported attachment type and size.",
      });
  });
export class PostAttachmentError extends Error {
  constructor(
    public readonly code:
      "invalid-attachment" | "attachment-unavailable" | "inactive",
  ) {
    super(code);
  }
}
export type AttachmentRecord = {
  ownerId: string;
  path: string;
  name: string;
  contentType: string;
  size: number;
  kind: "image" | "file";
  state: "reserved" | "ready" | "attached";
  postId?: string;
  generation?: string;
};
const receiptRef = (id: string) => {
  if (attachmentIdFromURL(`/api/feed/attachments/${id}`) !== id)
    throw new PostAttachmentError("invalid-attachment");
  return adminDb().doc(`postAttachments/${id}`);
};
async function activeOwner(uid: string) {
  if ((await adminDb().doc(`users/${uid}`).get()).data()?.status !== "active")
    throw new PostAttachmentError("inactive");
}
export async function reservePostAttachment(
  uid: string,
  input: z.infer<typeof reservePostAttachmentSchema>,
) {
  const parsed = reservePostAttachmentSchema.parse(input);
  const id = randomUUID();
  const extension =
    parsed.kind === "image"
      ? { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
          parsed.contentType as (typeof IMAGE_TYPES)[number]
        ]
      : parsed.name.split(".").at(-1)!.toLowerCase();
  const path = `posts/${uid}/${id}/attachment.${extension}`;
  await adminDb().runTransaction(async (transaction) => {
    const user = await transaction.get(adminDb().doc(`users/${uid}`));
    if (user.data()?.status !== "active")
      throw new PostAttachmentError("inactive");
    transaction.create(receiptRef(id), {
      ...parsed,
      ownerId: uid,
      path,
      state: "reserved",
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60_000),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { attachmentId: id, uploadPath: path, url: attachmentDeliveryURL(id) };
}
export async function finalizePostAttachment(uid: string, id: string) {
  await activeOwner(uid);
  const ref = receiptRef(id),
    initial = await ref.get();
  const data = initial.data() as AttachmentRecord | undefined;
  if (
    !data ||
    data.ownerId !== uid ||
    !ownedPostObjectPath(data.path, uid) ||
    !["reserved", "ready", "attached"].includes(data.state)
  )
    throw new PostAttachmentError("attachment-unavailable");
  const file = adminStorage().bucket().file(data.path);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
    if (
      Number(metadata.size) !== data.size ||
      metadata.contentType !== data.contentType ||
      data.size <= 0 ||
      data.size >
        (data.kind === "image" ? 10 * 1024 * 1024 : POST_FILE_MAX_SIZE)
    )
      throw new Error("Invalid object");
    metadata = await removeStorageDownloadTokens(file);
  } catch {
    throw new PostAttachmentError("invalid-attachment");
  }
  const generation = String(metadata.generation ?? "");
  if (!generation) throw new PostAttachmentError("invalid-attachment");
  await adminDb().runTransaction(async (transaction) => {
    const [current, user] = await transaction.getAll(
      ref,
      adminDb().doc(`users/${uid}`),
    );
    if (user.data()?.status !== "active")
      throw new PostAttachmentError("inactive");
    const value = current.data();
    if (
      value?.ownerId !== uid ||
      value.path !== data.path ||
      value.contentType !== data.contentType ||
      value.size !== data.size ||
      (value.generation && value.generation !== generation)
    )
      throw new PostAttachmentError("attachment-unavailable");
    if (value.state === "reserved")
      transaction.update(ref, {
        state: "ready",
        generation,
        finalizedAt: FieldValue.serverTimestamp(),
      });
  });
  return {
    url: attachmentDeliveryURL(id),
    name: data.name,
    contentType: data.contentType,
    size: data.size,
  };
}

export type PreparedPostMedia = {
  imageURLs: string[];
  fileAttachments: PostFileAttachment[];
  receiptIds: string[];
};
/** Public DTOs never expose our old bucket's bearer URLs, even to their owner. */
export function presentPostMedia(
  postId: string,
  authorId: string,
  imageURLs: string[],
  fileAttachments: PostFileAttachment[],
) {
  let bucket: string | undefined;
  function present(
    value: string,
    kind: "image" | "file",
    slot: number,
  ): string | null {
    if (!/^https?:\/\//u.test(value))
      return attachmentIdFromURL(value) || legacyMediaSlot(value)
        ? value
        : null;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    const candidate =
      url.hostname === "firebasestorage.googleapis.com" ||
      (Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST) &&
        url.host === process.env.FIREBASE_STORAGE_EMULATOR_HOST);
    if (!candidate) return value;
    bucket ??= adminStorage().bucket().name;
    const parsed = firebaseObjectURL(
      value,
      bucket,
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    );
    if (!parsed) {
      const encodedBucket = /^\/v0\/b\/([^/]+)/u.exec(url.pathname)?.[1];
      try {
        if (encodedBucket && decodeURIComponent(encodedBucket) === bucket)
          return null;
      } catch {
        return null;
      }
      return value;
    }
    return parsed.path && ownedPostObjectPath(parsed.path, authorId)
      ? legacyMediaURL(postId, kind, slot)
      : null;
  }
  return {
    imageURLs: imageURLs.flatMap((value, index) => {
      const url = present(value, "image", index);
      return url ? [url] : [];
    }),
    fileAttachments: fileAttachments.flatMap((file, index) => {
      const url = present(file.url, "file", index);
      return url ? [{ ...file, url }] : [];
    }),
  };
}
/** Resolve legacy identity using our configured bucket only; never fetch an HTTP URL. */
export async function preparePostMedia(
  uid: string,
  input: { imageURLs: string[]; fileAttachments: PostFileAttachment[] },
  existingPostId?: string,
): Promise<PreparedPostMedia> {
  if (!input.imageURLs.length && !input.fileAttachments.length)
    return { ...input, receiptIds: [] };
  await activeOwner(uid);
  const bucket = adminStorage().bucket();
  const existing = existingPostId
    ? await adminDb().doc(`posts/${existingPostId}`).get()
    : null;
  if (existingPostId && existing?.data()?.authorId !== uid)
    throw new PostAttachmentError("attachment-unavailable");
  const ids: string[] = [];
  async function resolve(
    value: string,
    kind: "image" | "file",
    declared?: PostFileAttachment,
  ): Promise<string> {
    const id = attachmentIdFromURL(value);
    if (id) {
      ids.push(id);
      return attachmentDeliveryURL(id);
    }
    const slot = legacyMediaSlot(value);
    let original = value;
    if (slot) {
      if (
        slot.postId !== existingPostId ||
        slot.kind !== kind ||
        !existing?.exists
      )
        throw new PostAttachmentError("invalid-attachment");
      const saved =
        kind === "image"
          ? existing.data()?.imageURLs?.[slot.slot]
          : existing.data()?.fileAttachments?.[slot.slot]?.url;
      if (typeof saved !== "string")
        throw new PostAttachmentError("invalid-attachment");
      original = saved;
    }
    const parsed = firebaseObjectURL(
      original,
      bucket.name,
      process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    );
    if (!parsed) {
      // Existing external links remain external; new app attachments require a receipt.
      const saved =
        kind === "image"
          ? existing?.data()?.imageURLs
          : existing
              ?.data()
              ?.fileAttachments?.map((file: PostFileAttachment) => file.url);
      if (Array.isArray(saved) && saved.includes(original)) return original;
      throw new PostAttachmentError("invalid-attachment");
    }
    if (!parsed.path || !ownedPostObjectPath(parsed.path, uid))
      throw new PostAttachmentError("invalid-attachment");
    let metadata;
    const file = bucket.file(parsed.path);
    try {
      [metadata] = await file.getMetadata();
    } catch {
      throw new PostAttachmentError("attachment-unavailable");
    }
    const contentType = String(metadata.contentType ?? ""),
      size = Number(metadata.size);
    const fileName = declared?.name ?? parsed.path.split("/").at(-1)!;
    const input = reservePostAttachmentSchema.safeParse({
      kind,
      name: fileName,
      contentType,
      size,
    });
    if (
      !input.success ||
      (declared &&
        (declared.contentType !== contentType || declared.size !== size))
    )
      throw new PostAttachmentError("invalid-attachment");
    await removeStorageDownloadTokens(file);
    const adoptedId = randomUUID();
    const generation = String(metadata.generation ?? "");
    if (!generation) throw new PostAttachmentError("invalid-attachment");
    await receiptRef(adoptedId).create({
      ...input.data,
      ownerId: uid,
      path: parsed.path,
      generation,
      state: "ready",
      createdAt: FieldValue.serverTimestamp(),
      finalizedAt: FieldValue.serverTimestamp(),
    });
    ids.push(adoptedId);
    return attachmentDeliveryURL(adoptedId);
  }
  const imageURLs: string[] = [],
    fileAttachments: PostFileAttachment[] = [];
  for (const value of input.imageURLs)
    imageURLs.push(await resolve(value, "image"));
  for (const file of input.fileAttachments)
    fileAttachments.push({
      ...file,
      url: await resolve(file.url, "file", file),
    });
  return { imageURLs, fileAttachments, receiptIds: [...new Set(ids)] };
}
/** Read during the domain transaction's read phase; claim only after all other reads. */
export async function readPostMediaClaims(
  transaction: Transaction,
  uid: string,
  postId: string,
  media: PreparedPostMedia,
) {
  const snapshots = media.receiptIds.length
    ? await transaction.getAll(...media.receiptIds.map(receiptRef))
    : [];
  for (const receipt of snapshots) {
    const data = receipt.data() as AttachmentRecord | undefined;
    const url = attachmentDeliveryURL(receipt.id);
    const image = media.imageURLs.includes(url),
      file = media.fileAttachments.find((value) => value.url === url);
    if (
      !data ||
      data.ownerId !== uid ||
      !ownedPostObjectPath(data.path, uid) ||
      !data.generation ||
      (data.state !== "ready" &&
        !(data.state === "attached" && data.postId === postId)) ||
      (image
        ? data.kind !== "image"
        : !file ||
          data.kind !== "file" ||
          data.size !== file.size ||
          data.contentType !== file.contentType ||
          data.name !== file.name)
    )
      throw new PostAttachmentError("attachment-unavailable");
  }
  return () => {
    for (const receipt of snapshots)
      if (receipt.data()?.state === "ready")
        transaction.update(receipt.ref, {
          state: "attached",
          postId,
          attachedAt: FieldValue.serverTimestamp(),
        });
  };
}
