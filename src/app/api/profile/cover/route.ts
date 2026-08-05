import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { getBillingState } from "@/lib/billing/server";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = {
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

  const billing = await getBillingState(auth.account.uid).catch(() => null);
  if (billing?.effectivePlan !== "plus") {
    return NextResponse.json(
      { error: "Profile cover customization requires VistaTeacher Plus." },
      { status: 403 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_COVER_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { error: "Cover images must be 5 MB or smaller." },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);
  const cover = form?.get("cover");
  if (!(cover instanceof File)) {
    return NextResponse.json(
      { error: "Choose a cover image." },
      { status: 400 },
    );
  }
  if (!(cover.type in COVER_TYPES)) {
    return NextResponse.json(
      { error: "Choose a JPG, PNG, or WebP image." },
      { status: 400 },
    );
  }
  if (cover.size === 0 || cover.size > MAX_COVER_BYTES) {
    return NextResponse.json(
      { error: "Cover images must be 5 MB or smaller." },
      { status: 400 },
    );
  }

  const extension = COVER_TYPES[cover.type as keyof typeof COVER_TYPES];
  const objectPath = `users/${auth.account.uid}/cover/${randomUUID()}.${extension}`;
  const token = randomUUID();
  const bucket = adminStorage().bucket();
  const object = bucket.file(objectPath);
  let coverImageURL: string;

  try {
    await object.save(Buffer.from(await cover.arrayBuffer()), {
      resumable: false,
      metadata: {
        contentType: cover.type,
        cacheControl: "public, max-age=3600",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    coverImageURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    await adminDb().doc(`users/${auth.account.uid}`).update({
      coverImageURL,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }

  try {
    const [objects] = await bucket.getFiles({
      prefix: `users/${auth.account.uid}/cover/`,
    });
    await Promise.all(
      objects
        .filter((item) => item.name !== objectPath)
        .map((item) => item.delete({ ignoreNotFound: true })),
    );
  } catch {}
  return NextResponse.json({ coverImageURL });
}

export async function DELETE(request: NextRequest) {
  const auth = await routeAccount(request);
  if ("response" in auth) return auth.response;

  await adminDb().doc(`users/${auth.account.uid}`).update({
    coverImageURL: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await adminStorage()
    .bucket()
    .deleteFiles({ prefix: `users/${auth.account.uid}/cover/` })
    .catch(() => undefined);
  return NextResponse.json({ coverImageURL: null });
}
