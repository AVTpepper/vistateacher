import { NextResponse, type NextRequest } from "next/server";
import { lessonRoute } from "@/lib/lessons/route-response";
import { getLessonBatch } from "@/lib/lessons/server";
import { lessonRequestIdSchema } from "@/schemas/lesson";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  return lessonRoute(request, async (uid) => {
    const requestId = lessonRequestIdSchema.parse((await params).requestId);
    return NextResponse.json(await getLessonBatch(uid, requestId));
  });
}
