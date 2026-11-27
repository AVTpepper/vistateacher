import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isRecentAuthentication,
  SESSION_COOKIE_NAME,
  SIGNED_IN_HOME,
  SESSION_MAX_AGE_MS,
} from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { adminAuth } from "@/lib/firebase/admin";
import {
  PrivateRecoveryError,
  recoverPrivateUser,
} from "@/lib/profiles/private-user";
import { sessionRequestSchema } from "@/schemas/auth";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const parsed = sessionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session request." },
      { status: 400 },
    );
  }

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(parsed.data.idToken, true);
  } catch (error) {
    console.error("Firebase ID token verification failed", error);
    return NextResponse.json(
      { error: "Unable to verify this sign-in." },
      { status: 401 },
    );
  }

  if (!decoded.email_verified || !decoded.email) {
    return NextResponse.json(
      { error: "Verify your email first." },
      { status: 403 },
    );
  }
  if (!isRecentAuthentication(decoded.auth_time)) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  try {
    const sessionCookie = await adminAuth().createSessionCookie(
      parsed.data.idToken,
      { expiresIn: SESSION_MAX_AGE_MS },
    );
    let profileExists = false;
    try {
      const recovery = await recoverPrivateUser(decoded.uid, decoded.email, {
        allowMissingProfile: true,
      });
      profileExists = recovery.state !== "onboarding-required";
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
      console.error("Private profile recovery failed during sign-in", {
        uid: decoded.uid,
        category: "unexpected",
      });
      return NextResponse.json(
        { error: "Unable to finish signing in. Please try again." },
        { status: 503 },
      );
    }

    const response = NextResponse.json({
      next: profileExists ? SIGNED_IN_HOME : "/onboarding",
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true",
      sameSite: "lax",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
      path: "/",
      priority: "high",
    });
    return response;
  } catch (error) {
    console.error("Firebase session cookie creation failed", error);
    return NextResponse.json(
      { error: "Unable to create session." },
      { status: 500 },
    );
  }
}
