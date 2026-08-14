import "server-only";

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { releaseLessonExport, reserveLessonExport } from "@/lib/lessons/server";
import type { LessonPlanInput } from "@/schemas/lesson";

export interface LessonExport {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
}

function safeFileName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "lesson-plan"
  );
}

function plainTextSections(content: LessonPlanInput) {
  return [
    ["Learning objectives", content.objectives],
    ["Materials", content.materials],
    [
      `Warm-up (${content.warmUp.durationMinutes} minutes)`,
      [content.warmUp.activity],
    ],
    [
      `Main activity (${content.mainActivity.durationMinutes} minutes)`,
      [content.mainActivity.description, ...content.mainActivity.steps],
    ],
    [
      `Closing activity (${content.closingActivity.durationMinutes} minutes)`,
      [content.closingActivity.activity],
    ],
    ["Assessment", [content.assessment]],
    ["Supports and scaffolds", content.differentiation.supports],
    ["Extensions and challenges", content.differentiation.extensions],
    ["Standards", content.standards],
  ] as const;
}

const VISTA_INK = rgb(0.1, 0.2, 0.26);
const VISTA_ACCENT = rgb(0.04, 0.55, 0.58);
const VISTA_MUTED = rgb(0.38, 0.45, 0.5);

function wrapText(text: string, maxCharacters = 92): string[] {
  const words = text.replace(/[^\x20-\x7E]/g, " ").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}

async function createPdf(content: LessonPlanInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  let page = document.addPage(pageSize);
  let y = 744;
  const drawLine = (text: string, size = 10, isBold = false, indent = 0) => {
    if (y < 52) {
      page = document.addPage(pageSize);
      y = 744;
    }
    page.drawText(text, {
      x: 54 + indent,
      y,
      size,
      font: isBold ? bold : regular,
      color: VISTA_INK,
    });
    y -= size + 5;
  };

  const drawHeader = () => {
    page.drawRectangle({
      x: 0,
      y: 742,
      width: pageSize[0],
      height: 50,
      color: VISTA_ACCENT,
    });
    page.drawText("VistaTeacher", {
      x: 54,
      y: 760,
      size: 11,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y = 716;
  };

  drawHeader();

  const drawSectionHeading = (heading: string) => {
    if (y < 70) {
      page = document.addPage(pageSize);
      drawHeader();
    }
    page.drawRectangle({
      x: 54,
      y: y - 2,
      width: 504,
      height: 18,
      color: rgb(0.93, 0.97, 0.98),
    });
    drawLine(heading, 12, true, 6);
    y -= 4;
  };

  for (const line of wrapText(content.title, 52)) drawLine(line, 20, true);
  y -= 1;
  drawLine(
    `${content.subject} | ${content.gradeLevel} | ${content.durationMinutes} minutes`,
    10,
  );
  drawLine(`Generated: ${new Date().toLocaleDateString("en-US")}`, 9, false);
  page.drawLine({
    start: { x: 54, y },
    end: { x: 558, y },
    thickness: 1,
    color: VISTA_MUTED,
  });
  y -= 12;
  for (const [heading, items] of plainTextSections(content)) {
    drawSectionHeading(heading);
    if (!items.length) drawLine("None specified", 10, false, 12);
    for (const item of items) {
      const lines = wrapText(item, 86);
      lines.forEach((line, index) =>
        drawLine(`${index === 0 ? "- " : "  "}${line}`, 10, false, 10),
      );
      y -= 2;
    }
    y -= 7;
  }
  return document.save();
}

async function createDocx(content: LessonPlanInput): Promise<Uint8Array> {
  const subtitle = `${content.subject} | ${content.gradeLevel} | ${content.durationMinutes} minutes`;
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "VistaTeacher", bold: true, color: "0B8C95" }),
      ],
    }),
    new Paragraph({
      text: content.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: subtitle, color: "4B5C66" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleDateString("en-US")}`,
          italics: true,
          color: "4B5C66",
        }),
      ],
    }),
  ];
  for (const [heading, items] of plainTextSections(content)) {
    children.push(
      new Paragraph({
        text: heading,
        heading: HeadingLevel.HEADING_1,
        thematicBreak: true,
      }),
    );
    if (!items.length) children.push(new Paragraph("None specified"));
    items.forEach((item) =>
      children.push(new Paragraph({ text: item, bullet: { level: 0 } })),
    );
  }
  const document = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(document));
}

export async function createLessonExport(
  uid: string,
  lessonId: string,
  format: "pdf" | "docx",
  options: { countUsage?: boolean } = {},
): Promise<LessonExport> {
  const reservation =
    options.countUsage === false
      ? await reserveLessonExport(uid, lessonId, { countUsage: false })
      : await reserveLessonExport(uid, lessonId);
  try {
    const baseName = safeFileName(reservation.lesson.title);
    return format === "pdf"
      ? {
          bytes: await createPdf(reservation.lesson.content),
          contentType: "application/pdf",
          fileName: `${baseName}.pdf`,
        }
      : {
          bytes: await createDocx(reservation.lesson.content),
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileName: `${baseName}.docx`,
        };
  } catch (error) {
    await releaseLessonExport(uid, reservation);
    throw error;
  }
}
