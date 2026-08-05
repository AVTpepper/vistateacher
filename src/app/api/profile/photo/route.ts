import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

async function routeAccount(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return {
      response: NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      ),
    };
  }
  const account = await getRouteAccount(request);
  return account
    ? { account }
    : {
        response: NextResponse.json(
          { error: "Authentication required." },
          { status: 401 },
        ),
      };
}

export async function POST(request: NextRequest) {
  const auth = await routeAccount(request);
  if ("response" in auth) return auth.response;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PHOTO_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { error: "Profile images must be 3 MB or smaller." },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json(
      { error: "Choose a profile image." },
      { status: 400 },
    );
  }
  if (!(photo.type in PHOTO_TYPES)) {
    return NextResponse.json(
      { error: "Choose a JPG, PNG, or WebP image." },
      { status: 400 },
    );
  }
  if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "Profile images must be 3 MB or smaller." },
      { status: 400 },
    );
  }

  const extension = PHOTO_TYPES[photo.type as keyof typeof PHOTO_TYPES];
  const objectPath = `users/${auth.account.uid}/photo/${randomUUID()}.${extension}`;
  const token = randomUUID();
  const bucket = adminStorage().bucket();
  const object = bucket.file(objectPath);
  let photoURL: string;

  try {
    await object.save(Buffer.from(await photo.arrayBuffer()), {
      resumable: false,
      metadata: {
        contentType: photo.type,
        cacheControl: "public, max-age=3600",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    photoURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    await adminDb().doc(`users/${auth.account.uid}`).update({
      photoURL,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }

  try {
    const [objects] = await bucket.getFiles({
      prefix: `users/${auth.account.uid}/photo/`,
    });
    await Promise.all(
      objects
        .filter((item) => item.name !== objectPath)
        .map((item) => item.delete({ ignoreNotFound: true })),
    );
  } catch {}

  return NextResponse.json({ photoURL });
}

export async function DELETE(request: NextRequest) {
  const auth = await routeAccount(request);
  if ("response" in auth) return auth.response;

  await adminDb().doc(`users/${auth.account.uid}`).update({
    photoURL: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await adminStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${auth.account.uid}/photo/` })
    .catch(() => undefined);
  return NextResponse.json({ photoURL: null });
}
