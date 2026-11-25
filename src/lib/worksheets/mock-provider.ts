import {
  WORKSHEET_QUESTION_TYPES,
  type WorksheetAnswer,
  type WorksheetContent,
  type WorksheetQuestion,
  type WorksheetSourceInput,
} from "@/schemas/worksheet";
import { validateGeneratedWorksheet } from "./validation";

export function createMockWorksheet(
  source: WorksheetSourceInput,
): WorksheetContent {
  const questions: WorksheetQuestion[] = [];
  const answerKey: WorksheetAnswer[] = [];
  for (const type of WORKSHEET_QUESTION_TYPES) {
    for (let index = 0; index < source.questionCounts[type]; index++) {
      const id = `q-${questions.length + 1}`;
      const difficulty =
        source.difficulty === "mixed"
          ? (["foundation", "core", "challenge"] as const)[questions.length % 3]
          : source.difficulty;
      const base = { id, difficulty };
      const answerBase = { questionId: id };
      switch (type) {
        case "multipleChoice":
          questions.push({
            ...base,
            type,
            prompt: `Sample multiple-choice question about ${source.topic}. Select the demonstration answer.`,
            options: [
              { id: "A", text: "Demonstration answer" },
              { id: "B", text: "Sample distractor one" },
              { id: "C", text: "Sample distractor two" },
              { id: "D", text: "Sample distractor three" },
            ],
          });
          answerKey.push({
            ...answerBase,
            type,
            correctOptionId: "A",
            explanation:
              "This sample demonstrates a single-correct-answer question.",
          });
          break;
        case "shortAnswer":
          questions.push({
            ...base,
            type,
            prompt: `Write a brief explanation of an idea connected to ${source.topic}.`,
            responseLines: 3,
          });
          answerKey.push({
            ...answerBase,
            type,
            modelAnswer:
              "This is demonstration content. A real generation will provide a subject-specific model answer.",
            acceptedAlternatives: [],
          });
          break;
        case "extendedResponse":
          questions.push({
            ...base,
            type,
            prompt: `Explain an idea about ${source.topic}, using an example and a reason.`,
            responseLines: 7,
          });
          answerKey.push({
            ...answerBase,
            type,
            exampleResponse:
              "This demonstration reserves space for a developed, subject-specific example response.",
            assessmentCriteria: [
              "Explains a relevant idea.",
              "Uses an example and supports the explanation with reasoning.",
            ],
          });
          break;
        case "matching":
          questions.push({
            ...base,
            type,
            prompt:
              "Match each sample term on the left with its definition on the right.",
            left: [
              { id: "l1", text: "Sample term one" },
              { id: "l2", text: "Sample term two" },
              { id: "l3", text: "Sample term three" },
            ],
            right: [
              { id: "r3", text: "Definition for sample term three" },
              { id: "r1", text: "Definition for sample term one" },
              { id: "r2", text: "Definition for sample term two" },
            ],
          });
          answerKey.push({
            ...answerBase,
            type,
            pairs: [
              { leftId: "l1", rightId: "r1" },
              { leftId: "l2", rightId: "r2" },
              { leftId: "l3", rightId: "r3" },
            ],
          });
          break;
        case "fillInBlank":
          questions.push({
            ...base,
            type,
            prompt: `This sample worksheet demonstrates ___ for a topic about ${source.topic}.`,
          });
          answerKey.push({
            ...answerBase,
            type,
            acceptedAnswers: [
              { alternatives: ["question formats", "worksheet formats"] },
            ],
          });
          break;
        case "trueFalse":
          questions.push({
            ...base,
            type,
            prompt: "This worksheet contains demonstration content.",
            trueLabel: "True",
            falseLabel: "False",
          });
          answerKey.push({
            ...answerBase,
            type,
            answer: true,
            explanation:
              "Sample mode illustrates the workflow without a real AI request.",
          });
          break;
      }
    }
  }
  return validateGeneratedWorksheet(
    {
      title: `${source.topic}: Sample worksheet`.slice(0, 160),
      subject: source.subject,
      gradeLevel: source.gradeLevel,
      language: source.language || "English",
      instructions:
        "Demonstration worksheet. Review each question and use the spaces provided. Real AI generation will follow the teaching brief and requested language.",
      labels: { name: "Name", date: "Date", answerKey: "Answer key" },
      questions,
      answerKey,
    },
    source,
  );
}
