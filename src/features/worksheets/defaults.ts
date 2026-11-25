import type { WorksheetSourceInput } from "@/schemas/worksheet";
export const EMPTY_WORKSHEET_SOURCE: WorksheetSourceInput = {
  subject: "",
  gradeLevel: "",
  topic: "",
  objectives: "",
  standards: "",
  studentNeeds: "",
  language: "English",
  curriculum: "",
  availableMaterials: "",
  additionalInstructions: "",
  difficulty: "core",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 1,
    matching: 1,
    fillInBlank: 1,
    trueFalse: 1,
  },
};
