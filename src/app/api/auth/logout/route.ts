import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/policy";
import { hasTrustedOrigin } from "@/lib/auth/request";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
