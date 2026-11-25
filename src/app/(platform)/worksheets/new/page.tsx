import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getLesson, LessonActionError } from "@/lib/lessons/server";
import { getWorksheetWorkspace } from "@/lib/worksheets/server";
import { WorksheetCreate } from "@/features/worksheets/worksheet-create";
import { EMPTY_WORKSHEET_SOURCE } from "@/features/worksheets/defaults";
import { worksheetSourceSchema } from "@/schemas/worksheet";
export const metadata: Metadata = { title: "Create worksheet" };
export default async function NewWorksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const account = await requireCurrentAccount();
  const lessonId = (await searchParams).lesson;
  if (lessonId && !/^[\w-]{1,128}$/.test(lessonId)) notFound();
  let lesson;
  if (lessonId) {
    try {
      lesson = await getLesson(account.uid, lessonId);
    } catch (error) {
      if (error instanceof LessonActionError) notFound();
      throw error;
    }
  }
  const workspace = await getWorksheetWorkspace(account.uid);
  const initialSource = lesson
    ? worksheetSourceSchema.parse({
        ...EMPTY_WORKSHEET_SOURCE,
        ...lesson.source,
        sourceLessonId: lesson.id,
      })
    : undefined;
  return (
    <div className="page-container">
      <WorksheetCreate
        uid={account.uid}
        usage={workspace.usage}
        initialSource={initialSource}
        referenceTitle={lesson?.title}
        sampleMode={process.env.AI_PROVIDER === "MOCK"}
      />
    </div>
  );
}
