import {
  worksheetContentSchema,
  studentWorksheetSchema,
  WORKSHEET_QUESTION_TYPES,
  type WorksheetContent,
  type WorksheetSourceInput,
} from "@/schemas/worksheet";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function unique(values: string[], label: string) {
  assert(
    new Set(values).size === values.length,
    `${label} must have unique IDs.`,
  );
}

export function validateWorksheetContent(value: unknown): WorksheetContent {
  const content = worksheetContentSchema.parse(value);
  unique(
    content.questions.map((question) => question.id),
    "Questions",
  );
  unique(
    content.answerKey.map((answer) => answer.questionId),
    "Answer-key entries",
  );
  assert(
    content.questions.length === content.answerKey.length,
    "Provide one answer-key entry per question.",
  );
  const answers = new Map(
    content.answerKey.map((answer) => [answer.questionId, answer]),
  );
  for (const question of content.questions) {
    const answer = answers.get(question.id);
    assert(!!answer, `Missing answer for question ${question.id}.`);
    assert(
      answer.type === question.type,
      `Answer type does not match question ${question.id}.`,
    );
    if (
      question.type === "multipleChoice" &&
      answer.type === "multipleChoice"
    ) {
      unique(
        question.options.map((option) => option.id),
        "Multiple-choice options",
      );
      unique(
        question.options.map((option) =>
          option.text.normalize("NFKC").toLocaleLowerCase().trim(),
        ),
        "Multiple-choice option texts",
      );
      assert(
        question.options.some((option) => option.id === answer.correctOptionId),
        `The correct option for ${question.id} must exist.`,
      );
    }
    if (question.type === "matching" && answer.type === "matching") {
      const leftIds = question.left.map((item) => item.id);
      const rightIds = question.right.map((item) => item.id);
      unique(leftIds, "Left matching items");
      unique(rightIds, "Right matching items");
      for (const column of [question.left, question.right])
        unique(
          column.map((item) =>
            item.text.normalize("NFKC").toLocaleLowerCase().trim(),
          ),
          "Matching item texts",
        );
      unique(
        answer.pairs.map((pair) => pair.leftId),
        "Matching answers on the left",
      );
      unique(
        answer.pairs.map((pair) => pair.rightId),
        "Matching answers on the right",
      );
      assert(
        leftIds.length === rightIds.length &&
          answer.pairs.length === leftIds.length,
        `Each matching item in ${question.id} needs exactly one partner.`,
      );
      assert(
        answer.pairs.every(
          (pair) =>
            leftIds.includes(pair.leftId) && rightIds.includes(pair.rightId),
        ),
        `Matching answers for ${question.id} must reference existing items.`,
      );
    }
    if (question.type === "fillInBlank" && answer.type === "fillInBlank") {
      const blankCount = question.prompt.match(/_{3,}/g)?.length ?? 0;
      assert(
        blankCount > 0 &&
          blankCount === answer.acceptedAnswers.length &&
          !/_{4,}/.test(question.prompt),
        `Use ___ for each blank in ${question.id} and provide answers in the same order.`,
      );
    }
    if (question.type === "trueFalse")
      assert(
        question.trueLabel.toLocaleLowerCase() !==
          question.falseLabel.toLocaleLowerCase(),
        "True and false labels must differ.",
      );
  }
  return content;
}

export function validateGeneratedWorksheet(
  value: unknown,
  source: WorksheetSourceInput,
): WorksheetContent {
  const content = validateWorksheetContent(value);
  assert(
    content.subject === source.subject &&
      content.gradeLevel === source.gradeLevel,
    "Keep the requested subject and grade level exactly.",
  );
  assert(
    content.language === (source.language || "English"),
    "Keep the requested language identifier exactly.",
  );
  for (const type of WORKSHEET_QUESTION_TYPES) {
    assert(
      content.questions.filter((question) => question.type === type).length ===
        source.questionCounts[type],
      `The requested ${type} question count was not respected.`,
    );
  }
  if (source.difficulty !== "mixed")
    assert(
      content.questions.every(
        (question) => question.difficulty === source.difficulty,
      ),
      "Keep every question at the requested difficulty.",
    );
  else {
    const counts = ["foundation", "core", "challenge"].map(
      (difficulty) =>
        content.questions.filter(
          (question) => question.difficulty === difficulty,
        ).length,
    );
    assert(
      Math.max(...counts) - Math.min(...counts) <= 1,
      "Balance mixed difficulty across foundation, core, and challenge.",
    );
  }
  return content;
}

/** Only this projection may be passed to student document rendering. */
export function studentWorksheet(content: WorksheetContent) {
  return studentWorksheetSchema.parse(validateWorksheetContent(content));
}
