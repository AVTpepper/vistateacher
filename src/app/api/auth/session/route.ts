import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isRecentAuthentication,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/auth/request";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
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

  if (!decoded.email_verified) {
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
      profileExists = (await adminDb().doc(`users/${decoded.uid}`).get()).exists;
    } catch (error) {
      console.error("Firestore profile lookup failed during sign-in", error);
    }

    const response = NextResponse.json({
      next: profileExists ? "/app" : "/onboarding",
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
