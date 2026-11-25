import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import type { TeachingDocument } from "@/lib/documents/docx";

export class UnsupportedPdfTextError extends Error {
  constructor() {
    super(
      "This PDF font does not support every character in this document. Download Word to preserve all text.",
    );
  }
}

type FontSet = {
  body: PDFFont;
  heading: PDFFont;
  fallback: PDFFont;
  coverage: Map<PDFFont, Set<number>>;
};
let fontFiles: Promise<Buffer[]> | undefined;
async function loadFonts(document: PDFDocument): Promise<FontSet> {
  fontFiles ??= Promise.all(
    [
      "Plus-Jakarta-Sans-Variable.ttf",
      "DM-Serif-Display-Regular.ttf",
      "JetBrains-Mono-Variable.ttf",
    ].map((name) =>
      readFile(path.join(process.cwd(), "public", "fonts", name)),
    ),
  );
  document.registerFontkit(fontkit);
  const [body, heading, fallback] = await Promise.all(
    (await fontFiles).map((bytes) =>
      document.embedFont(bytes, { subset: true }),
    ),
  );
  return {
    body,
    heading,
    fallback,
    coverage: new Map(
      [body, heading, fallback].map((font) => [
        font,
        new Set(font.getCharacterSet()),
      ]),
    ),
  };
}

/** Wrap by measured glyph widths; long URLs and unspaced text also fit. */
export function wrapPdfText(
  text: string,
  measure: (text: string) => number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.normalize("NFC").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const character of word) {
        if (line && measure(line + character) > width) {
          lines.push(line);
          line = "";
        }
        if (measure(character) > width)
          throw new Error("PDF text column is too narrow.");
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function createTeachingPdf({
  title,
  subtitle,
  sections,
  emptyText = "None specified",
}: TeachingDocument): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const fonts = await loadFonts(document);
  document.setTitle(title);
  document.setCreator("VistaTeacher");
  const chooseFont = (character: string, heading: boolean) => {
    const code = character.codePointAt(0)!;
    const preferred = heading ? fonts.heading : fonts.body;
    for (const font of [preferred, fonts.body, fonts.fallback])
      if (fonts.coverage.get(font)!.has(code)) return font;
    throw new UnsupportedPdfTextError();
  };
  const advances = new Map<string, number>();
  const measure = (text: string, size: number, heading: boolean) =>
    Array.from(text).reduce((width, character) => {
      const key = `${heading}:${size}:${character}`;
      let advance = advances.get(key);
      if (advance === undefined) {
        advance = chooseFont(character, heading).widthOfTextAtSize(
          character,
          size,
        );
        advances.set(key, advance);
      }
      return width + advance;
    }, 0);
  let page = document.addPage([595.28, 841.89]); // A4 for classroom printing.
  let y = 0;
  const startPage = (first = false) => {
    if (!first) page = document.addPage([595.28, 841.89]);
    page.drawRectangle({
      x: 0,
      y: 792,
      width: 595.28,
      height: 50,
      color: rgb(0.33, 0.02, 0.15),
    });
    page.drawText("VistaTeacher", {
      x: 48,
      y: 810,
      size: 12,
      font: fonts.body,
      color: rgb(1, 1, 1),
    });
    page.drawText(String(document.getPageCount()), {
      x: 540,
      y: 25,
      size: 9,
      font: fonts.body,
      color: rgb(0.4, 0.35, 0.32),
    });
    y = 762;
  };
  startPage(true);
  const line = (text: string, size: number, heading = false, indent = 0) => {
    if (y < 52) startPage();
    let x = 48 + indent;
    let run = "";
    let runFont: PDFFont | undefined;
    const flush = () => {
      if (!run || !runFont) return;
      page.drawText(run, {
        x,
        y,
        size,
        font: runFont,
        color: rgb(0.16, 0.13, 0.11),
      });
      x += measure(run, size, heading);
      run = "";
    };
    for (const character of text) {
      const font = chooseFont(character, heading);
      if (font !== runFont) {
        flush();
        runFont = font;
      }
      run += character;
    }
    flush();
    y -= size + 6;
  };
  const paragraph = (
    text: string,
    size: number,
    heading = false,
    indent = 0,
  ) => {
    for (const value of wrapPdfText(
      text,
      (value) => measure(value, size, heading),
      499 - indent,
    ))
      line(value, size, heading, indent);
  };
  paragraph(title, 22, true);
  paragraph(subtitle, 10);
  y -= 14;
  for (const [heading, items] of sections) {
    if (y < 105) startPage();
    paragraph(heading, 14, true);
    for (const item of items.length ? items : emptyText ? [emptyText] : []) {
      paragraph(item, 10, false, 10);
      y -= 4;
    }
    y -= 12;
  }
  return document.save();
}
