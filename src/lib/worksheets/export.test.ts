// @vitest-environment node
import { inflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { createMockWorksheet } from "./mock-provider";
import { worksheetSourceSchema } from "@/schemas/worksheet";
import { studentWorksheet } from "./validation";
import {
  studentWorksheetSections,
  answerKeySections,
  worksheetDocument,
} from "./document";
import { createWorksheetExport } from "./export";

const { getWorksheet } = vi.hoisted(() => ({ getWorksheet: vi.fn() }));
vi.mock("@/lib/worksheets/server", () => ({ getWorksheet }));
const source = worksheetSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Local food webs",
  difficulty: "core",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 1,
    matching: 1,
    fillInBlank: 1,
    trueFalse: 1,
  },
});
function documentXml(bytes: Uint8Array): string {
  const data = Buffer.from(bytes);
  for (let position = 0; position < data.length - 46; position++) {
    if (data.readUInt32LE(position) !== 0x02014b50) continue;
    const nameLength = data.readUInt16LE(position + 28);
    const name = data
      .subarray(position + 46, position + 46 + nameLength)
      .toString();
    if (name !== "word/document.xml") continue;
    const size = data.readUInt32LE(position + 20);
    const local = data.readUInt32LE(position + 42);
    const start =
      local +
      30 +
      data.readUInt16LE(local + 26) +
      data.readUInt16LE(local + 28);
    const compressed = data.subarray(start, start + size);
    return (
      data.readUInt16LE(position + 10) === 8
        ? inflateRawSync(compressed)
        : compressed
    ).toString();
  }
  throw new Error("Missing Word document XML");
}
describe("worksheet documents", () => {
  it("omits teacher-only fields from the student projection and actual Word file", async () => {
    const content = createMockWorksheet(source);
    const short = content.answerKey.find(
      (answer) => answer.type === "shortAnswer",
    )!;
    short.modelAnswer = "CONFIDENTIAL_TEACHER_KEY_739";
    const extended = content.answerKey.find(
      (answer) => answer.type === "extendedResponse",
    )!;
    extended.assessmentCriteria = ["CONFIDENTIAL_RUBRIC_918"];
    const projected = studentWorksheet(content);
    expect(projected).not.toHaveProperty("answerKey");
    expect(JSON.stringify(studentWorksheetSections(projected))).not.toContain(
      "CONFIDENTIAL",
    );
    expect(JSON.stringify(worksheetDocument(content, "student"))).not.toContain(
      "CONFIDENTIAL",
    );
    expect(JSON.stringify(worksheetDocument(content, "key"))).toContain(
      "CONFIDENTIAL_TEACHER_KEY_739",
    );
    getWorksheet.mockResolvedValue({
      title: content.title,
      content,
      currentVersion: 3,
    });
    const student = await createWorksheetExport(
      "teacher",
      "private-id",
      "docx",
      "student",
    );
    expect(getWorksheet).toHaveBeenCalledWith("teacher", "private-id");
    expect(documentXml(student.bytes)).toContain("Local food webs");
    expect(documentXml(student.bytes)).not.toContain("CONFIDENTIAL");
    expect(student.fileName).toContain("-student-v3.docx");
    const key = await createWorksheetExport(
      "teacher",
      "private-id",
      "docx",
      "key",
    );
    expect(documentXml(key.bytes)).toContain("CONFIDENTIAL_TEACHER_KEY_739");
    expect(documentXml(key.bytes)).toContain("CONFIDENTIAL_RUBRIC_918");
    expect(key.fileName).toContain("-answer-key-v3.docx");
  });
  it("retains localized labels and question text in the reusable descriptor", () => {
    const content = createMockWorksheet(source);
    content.title = "Årstider och lärande";
    content.subject = "Naturkunskap";
    content.gradeLevel = "Årskurs 6";
    content.instructions = "Besvara alla frågor.";
    content.labels = { name: "Namn", date: "Datum", answerKey: "Facit" };
    content.questions[0].prompt = "Vad behöver växter?";

    const student = worksheetDocument(content, "student");
    expect(student.title).toBe(content.title);
    expect(student.subtitle).toBe("Naturkunskap | Årskurs 6");
    expect(student.emptyText).toBe("");
    expect(student.sections[0]).toEqual([
      "Besvara alla frågor.",
      ["Namn: ____________________     Datum: __________"],
    ]);
    expect(student.sections[1][0]).toBe("1. Vad behöver växter?");
    expect(worksheetDocument(content, "key").title).toBe(
      "Årstider och lärande — Facit",
    );
  });
  it("numbers reordered questions consistently and maps shuffled matching columns by ID", () => {
    const content = createMockWorksheet(source);
    const matching = content.questions.find(
      (question) => question.type === "matching",
    )!;
    content.questions = [
      matching,
      ...content.questions.filter((question) => question.id !== matching.id),
    ];
    expect(studentWorksheetSections(studentWorksheet(content))[1][0]).toMatch(
      /^1\./,
    );
    const key = answerKeySections(content);
    expect(key[0][0]).toMatch(/^1\./);
    expect(key[0][1][0]).toContain("1 → B");
  });
});
