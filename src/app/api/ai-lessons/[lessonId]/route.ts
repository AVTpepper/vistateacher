import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { lessonErrorResponse } from "@/lib/lessons/route-response";
import { deleteLesson, getLesson, updateLesson } from "@/lib/lessons/server";
import { lessonUpdateSchema } from "@/schemas/lesson";

type Context = { params: Promise<{ lessonId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  try {
    return NextResponse.json(
      await getLesson(account.uid, (await params).lessonId),
    );
  } catch (error) {
    const response = lessonErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
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
  const parsed = lessonUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Review the lesson content." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await updateLesson(
        account.uid,
        (await params).lessonId,
        parsed.data.content,
        parsed.data.visibility,
      ),
    );
  } catch (error) {
    const response = lessonErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
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
  try {
    await deleteLesson(account.uid, (await params).lessonId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = lessonErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
