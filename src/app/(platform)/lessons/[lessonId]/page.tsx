import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SharedLessonView } from "@/features/lessons/shared-lesson-view";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getSharedLesson } from "@/lib/lessons/server";

export const metadata: Metadata = { title: "Lesson plan" };

export default async function SharedLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const [account, { lessonId }] = await Promise.all([
    requireCurrentAccount(),
    params,
  ]);
  const lesson = await getSharedLesson(lessonId, account.uid);
  if (!lesson) notFound();
  return (
    <div className="px-4 py-5 lg:px-6">
      <SharedLessonView lesson={lesson} />
    </div>
  );
}
