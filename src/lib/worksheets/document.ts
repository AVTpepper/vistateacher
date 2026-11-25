import type {
  StudentWorksheet,
  WorksheetContent,
  WorksheetQuestion,
} from "@/schemas/worksheet";
import type { TeachingDocument } from "@/lib/documents/docx";
import { studentWorksheet } from "@/lib/worksheets/validation";

export function worksheetDocument(
  content: WorksheetContent,
  mode: "student" | "key",
): TeachingDocument {
  return {
    emptyText: "",
    title:
      mode === "key"
        ? `${content.title} — ${content.labels.answerKey}`
        : content.title,
    subtitle: `${content.subject} | ${content.gradeLevel}`,
    sections:
      mode === "key"
        ? answerKeySections(content)
        : studentWorksheetSections(studentWorksheet(content)),
  };
}

const letter = (index: number) => String.fromCharCode(65 + index);
export function studentQuestionLines(question: WorksheetQuestion): string[] {
  switch (question.type) {
    case "multipleChoice":
      return question.options.map(
        (option, index) => `${letter(index)}. ${option.text}`,
      );
    case "shortAnswer":
    case "extendedResponse":
      return Array.from(
        { length: question.responseLines },
        () => "____________________________________________________________",
      );
    case "matching":
      return question.left.map(
        (item, index) =>
          `${index + 1}. ${item.text}  |  ${letter(index)}. ${question.right[index].text}`,
      );
    case "trueFalse":
      return [`${question.trueLabel} / ${question.falseLabel}`];
    case "fillInBlank":
      return [];
  }
}
export function studentWorksheetSections(
  content: StudentWorksheet,
): [string, string[]][] {
  return [
    [
      content.instructions,
      [
        `${content.labels.name}: ____________________     ${content.labels.date}: __________`,
      ],
    ],
    ...content.questions.map((question, index): [string, string[]] => [
      `${index + 1}. ${question.prompt}`,
      studentQuestionLines(question),
    ]),
  ];
}
export function answerKeySections(
  content: WorksheetContent,
): [string, string[]][] {
  const keys = new Map(
    content.answerKey.map((answer) => [answer.questionId, answer]),
  );
  return content.questions.map((question, index) => {
    const answer = keys.get(question.id)!;
    let lines: string[] = [];
    if (
      question.type === "multipleChoice" &&
      answer.type === "multipleChoice"
    ) {
      const correct = question.options.findIndex(
        (option) => option.id === answer.correctOptionId,
      );
      lines = [
        `${letter(correct)}. ${question.options[correct].text}`,
        answer.explanation,
      ];
    }
    if (answer.type === "shortAnswer")
      lines = [answer.modelAnswer, ...answer.acceptedAlternatives];
    if (answer.type === "extendedResponse")
      lines = [
        answer.exampleResponse,
        ...answer.assessmentCriteria.map((criterion) => `- ${criterion}`),
      ];
    if (question.type === "matching" && answer.type === "matching")
      lines = question.left.map((item, position) => {
        const pair = answer.pairs.find((value) => value.leftId === item.id)!;
        const right = question.right.findIndex(
          (value) => value.id === pair.rightId,
        );
        return `${position + 1} → ${letter(right)}: ${item.text} → ${question.right[right].text}`;
      });
    if (answer.type === "fillInBlank")
      lines = answer.acceptedAnswers.map(
        (values, position) =>
          `${position + 1}. ${values.alternatives.join(" / ")}`,
      );
    if (question.type === "trueFalse" && answer.type === "trueFalse")
      lines = [
        answer.answer ? question.trueLabel : question.falseLabel,
        answer.explanation,
      ];
    return [`${index + 1}. ${question.prompt}`, lines];
  });
}
