import {
  WORKSHEET_QUESTION_TYPES,
  type WorksheetQuestionType,
} from "@/schemas/worksheet";

/** Stable ordering keeps generation retries and saved briefs reproducible. */
export function balanceQuestionCounts(
  total: number,
  selected: readonly WorksheetQuestionType[],
): Record<WorksheetQuestionType, number> {
  const types = WORKSHEET_QUESTION_TYPES.filter((type) =>
    selected.includes(type),
  );
  return Object.fromEntries(
    WORKSHEET_QUESTION_TYPES.map((type) => {
      const index = types.indexOf(type);
      return [
        type,
        index < 0 || !Number.isInteger(total) || total < 1
          ? 0
          : Math.floor(total / types.length) +
            (index < total % types.length ? 1 : 0),
      ];
    }),
  ) as Record<WorksheetQuestionType, number>;
}
