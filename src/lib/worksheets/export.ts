import "server-only";
import { createTeachingPdf } from "@/lib/documents/pdf";
import { createTeachingDocx, safeDocumentName } from "@/lib/documents/docx";
import { worksheetDocument } from "@/lib/worksheets/document";
import { getWorksheet } from "@/lib/worksheets/server";

export async function createWorksheetExport(
  uid: string,
  id: string,
  format: "pdf" | "docx",
  mode: "student" | "key",
) {
  const worksheet = await getWorksheet(uid, id);
  const content = worksheet.content;
  const document = worksheetDocument(content, mode);
  return {
    bytes: await (format === "pdf"
      ? createTeachingPdf(document)
      : createTeachingDocx(document)),
    contentType:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: `${safeDocumentName(content.title)}-${mode === "key" ? "answer-key" : "student"}-v${worksheet.currentVersion}.${format}`,
  };
}
