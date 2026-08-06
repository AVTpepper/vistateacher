import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRouteAccount } from "@/lib/auth/route-account";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const { uid } = await params;
  const snapshot = await adminDb().doc(`users/${uid}`).get();
  if (!snapshot.exists)
    return NextResponse.json({ error: "Educator not found." }, { status: 404 });

  const data = snapshot.data();
  const status = String(data?.status ?? "active");
  if (status === "suspended" || status === "deleted")
    return NextResponse.json(
      { error: "This educator is unavailable." },
      { status: 409 },
    );

  return NextResponse.json({
    educator: {
      uid,
      displayName: String(data?.displayName ?? "Educator"),
      photoURL: typeof data?.photoURL === "string" ? data.photoURL : null,
      gradeLevel: String(data?.gradeLevel ?? "Educator"),
      subjects: Array.isArray(data?.subjects) ? data.subjects.map(String) : [],
      school: String(data?.school ?? ""),
      city: String(data?.city ?? ""),
      isVerified: data?.isVerified === true,
    },
  });
}
