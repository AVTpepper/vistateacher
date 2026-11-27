import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonBuilderExperience } from "@/features/lessons/lesson-builder-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import {
  getLesson,
  getLessonWorkspace,
  LessonActionError,
} from "@/lib/lessons/server";
import { lessonActionSchema } from "@/schemas/lesson";

export const metadata: Metadata = { title: "AI Lesson Builder" };

export default async function AiLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const account = await requireCurrentAccount();
  const workspace = await getLessonWorkspace(account.uid);
  const requestedId = (await searchParams).lesson;
  if (
    requestedId &&
    !lessonActionSchema.safeParse({ lessonId: requestedId }).success
  )
    notFound();
  const selectedId =
    requestedId === "new"
      ? undefined
      : (requestedId ?? workspace.lessons[0]?.id);
  const lesson = selectedId
    ? await getLesson(account.uid, selectedId).catch((error) => {
        if (
          error instanceof LessonActionError &&
          ["not-found", "not-owner"].includes(error.code)
        )
          notFound();
        throw error;
      })
    : null;

  return (
    <div className="page-container">
      <LessonBuilderExperience
        viewerUid={account.uid}
        initialWorkspace={workspace}
        initialLesson={lesson}
        sampleMode={process.env.AI_PROVIDER === "MOCK"}
      />
    </div>
  );
}
