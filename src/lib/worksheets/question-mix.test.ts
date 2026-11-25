import { describe, expect, it } from "vitest";
import { balanceQuestionCounts } from "./question-mix";
import { WORKSHEET_QUESTION_TYPES } from "@/schemas/worksheet";
describe("balanced worksheet mix", () => {
  it("balances a total across selected types without changing the total", () => {
    const counts = balanceQuestionCounts(14, WORKSHEET_QUESTION_TYPES);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(
      14,
    );
    expect(
      Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)),
    ).toBe(1);
    expect(counts.multipleChoice).toBe(3);
  });
  it("excludes unselected types and supports 30 of one type", () => {
    expect(balanceQuestionCounts(30, ["shortAnswer"]).shortAnswer).toBe(30);
    expect(balanceQuestionCounts(7, ["trueFalse", "matching"])).toEqual({
      multipleChoice: 0,
      shortAnswer: 0,
      extendedResponse: 0,
      matching: 4,
      fillInBlank: 0,
      trueFalse: 3,
    });
  });
  it("keeps empty selections and invalid totals safe for incomplete drafts", () => {
    for (const counts of [
      balanceQuestionCounts(5, []),
      balanceQuestionCounts(NaN, WORKSHEET_QUESTION_TYPES),
    ])
      expect(Object.values(counts).every((value) => value === 0)).toBe(true);
  });
});
