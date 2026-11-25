import "server-only";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export type TeachingDocument = {
  title: string;
  subtitle: string;
  sections: ReadonlyArray<readonly [string, readonly string[]]>;
  bullets?: boolean;
  emptyText?: string;
};

export function safeDocumentName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "teaching-resource"
  );
}
export async function createTeachingDocx({
  title,
  subtitle,
  sections,
  bullets = false,
  emptyText = "None specified",
}: TeachingDocument): Promise<Uint8Array> {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "VistaTeacher", bold: true, color: "0B8C95" }),
      ],
    }),
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: subtitle, alignment: AlignmentType.CENTER }),
  ];
  for (const [heading, items] of sections) {
    children.push(
      new Paragraph({
        text: heading,
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
      }),
    );
    for (const item of items.length ? items : emptyText ? [emptyText] : [])
      children.push(
        new Paragraph({
          text: item,
          ...(bullets ? { bullet: { level: 0 } } : {}),
        }),
      );
  }
  return new Uint8Array(
    await Packer.toBuffer(new Document({ sections: [{ children }] })),
  );
}
