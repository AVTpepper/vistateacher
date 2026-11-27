import { NextResponse, type NextRequest } from "next/server";
import { lessonJson, lessonRoute } from "@/lib/lessons/route-response";
import { deleteLesson, getLesson, updateLesson } from "@/lib/lessons/server";
import { lessonActionSchema, lessonUpdateSchema } from "@/schemas/lesson";

type Context = { params: Promise<{ lessonId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  return lessonRoute(request, async (uid) => {
    const { lessonId } = lessonActionSchema.parse(await params);
    return NextResponse.json(await getLesson(uid, lessonId));
  });
}
export async function PATCH(request: NextRequest, { params }: Context) {
  return lessonRoute(request, async (uid) => {
    const { lessonId } = lessonActionSchema.parse(await params);
    const { content, visibility, expectedVersion } = lessonUpdateSchema.parse(
      await lessonJson(request),
    );
    return NextResponse.json(
      await updateLesson(uid, lessonId, content, visibility, expectedVersion),
    );
  });
}
export async function DELETE(request: NextRequest, { params }: Context) {
  return lessonRoute(request, async (uid) => {
    const { lessonId } = lessonActionSchema.parse(await params);
    await deleteLesson(uid, lessonId);
    return NextResponse.json({ deleted: true });
  });
}
