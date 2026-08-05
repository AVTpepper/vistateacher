import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { lessonErrorResponse } from "@/lib/lessons/route-response";
import {
  createLesson,
  createLessons,
  getLessonWorkspace,
} from "@/lib/lessons/server";
import { lessonCreateRequestSchema } from "@/schemas/lesson";

export async function GET(request: NextRequest) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  return NextResponse.json(await getLessonWorkspace(account.uid));
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = lessonCreateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid lesson parameters.",
      },
      { status: 400 },
    );
  try {
    if (parsed.data.count <= 1)
      return NextResponse.json(
        await createLesson(account.uid, parsed.data.source),
        { status: 201 },
      );
    return NextResponse.json(
      {
        lessons: await createLessons(
          account.uid,
          parsed.data.source,
          parsed.data.count,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    const response = lessonErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
