import { NextResponse, type NextRequest } from "next/server";
import { lessonJson, lessonRoute } from "@/lib/lessons/route-response";
import { restoreLessonVersion } from "@/lib/lessons/server";
import {
  lessonActionSchema,
  lessonRestoreSchema,
  lessonVersionNumberSchema,
} from "@/schemas/lesson";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; version: string }> },
) {
  return lessonRoute(request, async (uid) => {
    const values = await params;
    const { lessonId } = lessonActionSchema.parse(values);
    const version = lessonVersionNumberSchema.parse(values.version);
    const { expectedVersion } = lessonRestoreSchema.parse(
      await lessonJson(request),
    );
    return NextResponse.json(
      await restoreLessonVersion(uid, lessonId, version, expectedVersion),
    );
  });
}
