import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { verifySessionCookie } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import {
  createSearchKeywords,
  normalizeSearchText,
} from "@/lib/search/normalize";
import { onboardingSchema } from "@/schemas/auth";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const account = cookie ? await verifySessionCookie(cookie) : null;
  if (!account) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (account.status === "suspended" || account.status === "deleted") {
    return NextResponse.json(
      { error: "Account unavailable." },
      { status: 403 },
    );
  }

  const parsed = onboardingSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Review the highlighted profile details.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const profileRef = db.doc(`users/${account.uid}`);
    if ((await transaction.get(profileRef)).exists) return;

    const now = FieldValue.serverTimestamp();
    transaction.set(profileRef, {
      uid: account.uid,
      displayName: input.displayName,
      displayNameLower: normalizeSearchText(input.displayName),
      photoURL: account.photoURL,
      coverImageURL: null,
      role: "educator",
      gradeLevel: input.gradeLevel,
      subjects: input.subjects,
      country: input.country,
      city: input.city,
      cityLower: normalizeSearchText(input.city),
      school: input.school,
      schoolLower: normalizeSearchText(input.school),
      yearsOfExperience: input.yearsOfExperience,
      bio: input.bio,
      website: null,
      interests: input.interests,
      searchKeywords: createSearchKeywords([
        input.displayName,
        input.city,
        input.school,
        ...input.subjects,
        ...input.interests,
      ]),
      isVerified: false,
      followerCount: 0,
      followingCount: 0,
      resourceCount: 0,
      postCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(db.doc(`userPrivate/${account.uid}`), {
      email: account.email,
      contactDetails: {},
      privacySettings: { shareContactInfo: false },
      notificationSettings: { email: true, inApp: true },
      accountDeletion: { requestedAt: null },
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(db.doc(`subscriptions/${account.uid}`), {
      plan: "free",
      status: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialStartedAt: null,
      trialEndsAt: null,
      trialConsumed: false,
      updatedAt: now,
    });
  });

  return NextResponse.json({ next: "/app" });
}
