import { NextResponse, type NextRequest } from "next/server";
import { lessonJson, lessonRoute } from "@/lib/lessons/route-response";
import { regenerateLesson } from "@/lib/lessons/server";
import { lessonActionSchema, lessonRegenerateSchema } from "@/schemas/lesson";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  return lessonRoute(request, async (uid) => {
    const { lessonId } = lessonActionSchema.parse(await params);
    const {
      source,
      feedback,
      referenceContent,
      expectedVersion,
      requestId,
      retryId,
    } = lessonRegenerateSchema.parse(await lessonJson(request));
    return NextResponse.json(
      await regenerateLesson(
        uid,
        lessonId,
        source,
        feedback,
        referenceContent,
        { expectedVersion, requestId, retryId },
      ),
    );
  });
}
