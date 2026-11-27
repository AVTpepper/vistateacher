import { NextResponse, type NextRequest } from "next/server";
import { lessonRoute } from "@/lib/lessons/route-response";
import { getLessonVersion } from "@/lib/lessons/server";
import {
  lessonActionSchema,
  lessonVersionNumberSchema,
} from "@/schemas/lesson";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; version: string }> },
) {
  return lessonRoute(request, async (uid) => {
    const values = await params;
    const { lessonId } = lessonActionSchema.parse(values);
    const version = lessonVersionNumberSchema.parse(values.version);
    return NextResponse.json(await getLessonVersion(uid, lessonId, version));
  });
}
