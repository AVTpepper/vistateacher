// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createTeachingPdf, UnsupportedPdfTextError, wrapPdfText } from "./pdf";

describe("classroom PDF export", () => {
  it("wraps long unspaced text within the column without deleting Unicode", () => {
    const text = "Åäöé " + "https://example.org/" + "x".repeat(300) + " θ ∫";
    const lines = wrapPdfText(
      text,
      (value) => Array.from(value).length * 5,
      100,
    );
    expect(lines.every((line) => Array.from(line).length * 5 <= 100)).toBe(
      true,
    );
    expect(lines.join("").replaceAll(" ", "")).toBe(text.replaceAll(" ", ""));
  });
  it("embeds Swedish text and mathematical symbols in a multipage document", async () => {
    const bytes = await createTeachingPdf({
      title: "Årstider och lärande",
      subtitle: "Årskurs 6 | θ, ∫, ∀",
      sections: [
        [
          "Övning",
          Array.from(
            { length: 60 },
            () =>
              "Förklara sambandet mellan växter och miljö. " + "x".repeat(200),
          ),
        ],
      ],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    const maps = pdf.context
      .enumerateIndirectObjects()
      .flatMap(([, value]) =>
        value instanceof PDFRawStream
          ? [Buffer.from(decodePDFRawStream(value).decode()).toString("utf8")]
          : [],
      )
      .filter((value) => value.includes("begincmap"))
      .join("\n");
    expect(maps).toMatch(/00c5/i); // Å is embedded in a searchable Unicode map.
    expect(maps).toMatch(/03b8/i); // θ is supplied by the fallback font.
  });
  it("offers a lossless alternative when a script is unavailable in bundled fonts", async () => {
    await expect(
      createTeachingPdf({ title: "中文", subtitle: "", sections: [] }),
    ).rejects.toBeInstanceOf(UnsupportedPdfTextError);
  });
});
