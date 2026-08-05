import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { lessonErrorResponse } from "@/lib/lessons/route-response";
import { regenerateLesson } from "@/lib/lessons/server";
import { lessonRegenerateSchema } from "@/schemas/lesson";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
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
  const parsed = lessonRegenerateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid lesson parameters." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await regenerateLesson(
        account.uid,
        (await params).lessonId,
        parsed.data.source,
        parsed.data.feedback,
        parsed.data.referenceContent,
      ),
    );
  } catch (error) {
    const response = lessonErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
