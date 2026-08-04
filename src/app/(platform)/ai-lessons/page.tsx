import type { Metadata } from "next";

import { LessonBuilderExperience } from "@/features/lessons/lesson-builder-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getLesson, getLessonWorkspace } from "@/lib/lessons/server";

export const metadata: Metadata = { title: "AI Lesson Builder" };

export default async function AiLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string }>;
}) {
  const account = await requireCurrentAccount();
  const workspace = await getLessonWorkspace(account.uid);
  const requestedId = (await searchParams).lesson;
  const selectedId = requestedId ?? workspace.lessons[0]?.id;
  const lesson = selectedId ? await getLesson(account.uid, selectedId) : null;

  return (
    <main className="h-full overflow-y-auto px-4 py-5 lg:px-6">
      <LessonBuilderExperience
        initialWorkspace={workspace}
        initialLesson={lesson}
      />
    </main>
  );
}
