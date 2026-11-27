import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { lessonRoute } from "@/lib/lessons/route-response";
import { duplicateLesson } from "@/lib/lessons/server";
import { lessonActionSchema } from "@/schemas/lesson";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  return lessonRoute(request, async (uid) => {
    const { lessonId } = lessonActionSchema.parse(await params);
    return NextResponse.json(await duplicateLesson(uid, lessonId), {
      status: 201,
    });
  });
}
