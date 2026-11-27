import { NextResponse, type NextRequest } from "next/server";
import { lessonJson, lessonRoute } from "@/lib/lessons/route-response";
import {
  createLesson,
  createLessonBatch,
  getLessonWorkspace,
} from "@/lib/lessons/server";
import {
  lessonCreateRequestSchema,
  lessonCursorSchema,
} from "@/schemas/lesson";

export async function GET(request: NextRequest) {
  return lessonRoute(request, async (uid) => {
    const cursor = lessonCursorSchema.parse(
      request.nextUrl.searchParams.get("cursor") ?? undefined,
    );
    return NextResponse.json(await getLessonWorkspace(uid, cursor));
  });
}
export async function POST(request: NextRequest) {
  return lessonRoute(request, async (uid) => {
    const { source, count, requestId, retryId } =
      lessonCreateRequestSchema.parse(await lessonJson(request));
    const result =
      count === 1
        ? await createLesson(uid, source, requestId, retryId)
        : await createLessonBatch(uid, source, count, requestId, retryId);
    return NextResponse.json(result, { status: 201 });
  });
}
