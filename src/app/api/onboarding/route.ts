import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, SIGNED_IN_HOME } from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { verifySessionCookie } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import {
  applyPrivateUserPlan,
  planPrivateUserRepair,
  PrivateRecoveryError,
} from "@/lib/profiles/private-user";
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
  try {
    await db.runTransaction(async (transaction) => {
      const profileRef = db.doc(`users/${account.uid}`);
      const privateRef = db.doc(`userPrivate/${account.uid}`);
      const subscriptionRef = db.doc(`subscriptions/${account.uid}`);
      const [profile, privateUser, subscription, deletionJob] =
        await transaction.getAll(
          profileRef,
          privateRef,
          subscriptionRef,
          db.doc(`accountDeletions/${account.uid}`),
        );
      const now = FieldValue.serverTimestamp();
      const plan = planPrivateUserRepair(
        privateUser.data(),
        account.email,
        {
          profile: !profile.exists
            ? "new"
            : profile.data()?.status === "active"
              ? "active"
              : "inactive",
          deletionJobExists: deletionJob.exists,
        },
        now,
      );
      if (plan.state === "recovery-required")
        throw new PrivateRecoveryError("recovery-required");

      if (!profile.exists) {
        transaction.set(profileRef, {
          uid: account.uid,
          displayName: input.displayName,
          displayNameLower: normalizeSearchText(input.displayName),
          professionalRoles: input.professionalRoles,
          photoURL: account.photoURL,
          coverImageURL: null,
          coverTheme: "burgundy-bloom",
          role: "educator",
          gradeLevel: input.gradeLevel,
          subjects: input.subjects,
          languages: input.languages,
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
            ...input.professionalRoles,
            ...input.subjects,
            ...input.languages,
            ...input.interests,
          ]),
          isVerified: false,
          connectionCount: 0,
          resourceCount: 0,
          postCount: 0,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      }
      applyPrivateUserPlan(transaction, privateRef, plan);
      if (!subscription.exists) {
        transaction.set(subscriptionRef, {
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
      }
    });
  } catch (error) {
    if (error instanceof PrivateRecoveryError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status:
            error.code === "invalid-identity"
              ? 401
              : ["inactive", "deletion-blocked"].includes(error.code)
                ? 403
                : 409,
        },
      );
    console.error("Onboarding account setup failed", {
      uid: account.uid,
      category: "unexpected",
    });
    return NextResponse.json(
      {
        error: "We couldn't finish setting up your account. Please try again.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ next: SIGNED_IN_HOME });
}
