import "server-only";

import { createTeachingDocx, safeDocumentName } from "@/lib/documents/docx";
import { createTeachingPdf } from "@/lib/documents/pdf";

import { authorizeLessonExport } from "@/lib/lessons/server";
import { lessonDocument } from "@/lib/lessons/document";

export interface LessonExport {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
}

export async function createLessonExport(
  uid: string,
  lessonId: string,
  format: "pdf" | "docx",
): Promise<LessonExport> {
  const lesson = await authorizeLessonExport(uid, lessonId);
  const baseName = safeDocumentName(lesson.title);
  const document = lessonDocument(lesson.content);
  return format === "pdf"
    ? {
        bytes: await createTeachingPdf(document),
        contentType: "application/pdf",
        fileName: `${baseName}.pdf`,
      }
    : {
        bytes: await createTeachingDocx(document),
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: `${baseName}.docx`,
      };
}
