import { describe, expect, it } from "vitest";
import { worksheetSourceSchema } from "@/schemas/worksheet";
import { createMockWorksheet } from "./mock-provider";
import {
  validateGeneratedWorksheet,
  validateWorksheetContent,
} from "./validation";

const source = worksheetSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Ages 10–12",
  topic: "Local food webs",
  difficulty: "core",
  language: "English",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 1,
    matching: 1,
    fillInBlank: 1,
    trueFalse: 1,
  },
});
const fixture = () => structuredClone(createMockWorksheet(source));

describe("worksheet integrity", () => {
  it("supports every requested type with separate student questions and keys", () => {
    const content = fixture();
    expect(content.questions).toHaveLength(6);
    expect(content.answerKey).toHaveLength(6);
    expect(
      content.questions.every(
        (question) =>
          !("answer" in question) &&
          !("correctOptionId" in question) &&
          !("modelAnswer" in question),
      ),
    ).toBe(true);
    expect(validateGeneratedWorksheet(content, source)).toEqual(content);
  });
  it("bounds total question counts and rejects fractional or empty mixes", () => {
    expect(() =>
      worksheetSourceSchema.parse({
        ...source,
        questionCounts: { ...source.questionCounts, multipleChoice: 0.5 },
      }),
    ).toThrow();
    expect(() =>
      worksheetSourceSchema.parse({
        ...source,
        questionCounts: Object.fromEntries(
          Object.keys(source.questionCounts).map((key) => [key, 0]),
        ),
      }),
    ).toThrow("between 1 and 30");
    expect(() =>
      worksheetSourceSchema.parse({
        ...source,
        questionCounts: {
          ...source.questionCounts,
          multipleChoice: 15,
          shortAnswer: 15,
        },
      }),
    ).toThrow("between 1 and 30");
  });
  it("rejects orphan, duplicate and missing answer-key entries", () => {
    for (const mutate of [
      (content: ReturnType<typeof fixture>) => {
        content.answerKey[0].questionId = "unknown";
      },
      (content: ReturnType<typeof fixture>) => {
        content.answerKey[1].questionId = content.answerKey[0].questionId;
      },
      (content: ReturnType<typeof fixture>) => {
        content.answerKey.pop();
      },
    ]) {
      const content = fixture();
      mutate(content);
      expect(() => validateWorksheetContent(content)).toThrow();
    }
  });
  it("rejects incorrect option references and duplicate matching partners", () => {
    const choice = fixture();
    const answer = choice.answerKey[0];
    if (answer.type !== "multipleChoice") throw Error("fixture");
    answer.correctOptionId = "missing";
    expect(() => validateWorksheetContent(choice)).toThrow("correct option");
    const matching = fixture();
    const key = matching.answerKey.find(
      (answer) => answer.type === "matching",
    )!;
    key.pairs[1].rightId = key.pairs[0].rightId;
    expect(() => validateWorksheetContent(matching)).toThrow("unique IDs");
  });
  it("requires one ordered answer list for every blank", () => {
    const content = fixture();
    content.questions.find(
      (question) => question.type === "fillInBlank",
    )!.prompt = "Complete ___ and ___.";
    expect(() => validateWorksheetContent(content)).toThrow("same order");
  });
  it("enforces the requested mix and difficulty during generation", () => {
    const content = fixture();
    content.questions[0].difficulty = "challenge";
    expect(() => validateGeneratedWorksheet(content, source)).toThrow(
      "difficulty",
    );
    expect(() =>
      validateGeneratedWorksheet(fixture(), {
        ...source,
        questionCounts: { ...source.questionCounts, trueFalse: 2 },
      }),
    ).toThrow("question count");
  });
  it("keeps answer alignment after questions are reordered or removed together", () => {
    const content = fixture();
    content.questions.reverse();
    const removed = content.questions.pop()!;
    content.answerKey = content.answerKey.filter(
      (answer) => answer.questionId !== removed.id,
    );
    expect(validateWorksheetContent(content).questions).toHaveLength(5);
  });
  it("handles the longest brief and the maximum accepted worksheet size", () => {
    const brief = {
      ...source,
      topic: "T".repeat(240),
      difficulty: "mixed" as const,
      questionCounts: {
        multipleChoice: 15,
        shortAnswer: 15,
        extendedResponse: 0,
        matching: 0,
        fillInBlank: 0,
        trueFalse: 0,
      },
    };
    expect(createMockWorksheet(brief).questions).toHaveLength(30);
    expect(createMockWorksheet(brief).title.length).toBeLessThanOrEqual(160);
  });
});
