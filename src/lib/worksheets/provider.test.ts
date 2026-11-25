import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { generateWorksheet } from "./provider";
import { createMockWorksheet } from "./mock-provider";
import { worksheetSourceSchema } from "@/schemas/worksheet";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    static APIError = class extends Error {};
    responses = { parse };
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const source = worksheetSourceSchema.parse({
  subject: "Music",
  gradeLevel: "Ages 8–10",
  topic: "Local folk songs",
  difficulty: "mixed",
  language: "Swedish",
  curriculum: "Lgr22",
  classSize: 24,
  availableMaterials: "Paper and pencils, no devices",
  additionalInstructions: "Listen outdoors",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 1,
    matching: 1,
    fillInBlank: 1,
    trueFalse: 1,
  },
});
function live() {
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("OPENAI_API_KEY", "sk-test-unused");
}
describe("structured worksheet generation", () => {
  it("sends all teacher context, the exact mix, and requested difficulty", async () => {
    live();
    parse.mockResolvedValueOnce({ output_parsed: createMockWorksheet(source) });
    await generateWorksheet(source);
    const request = parse.mock.calls[0][0];
    for (const text of [
      "Lgr22",
      "Swedish",
      "24",
      "Listen outdoors",
      "Paper and pencils, no devices",
      '"multipleChoice":1',
      "Difficulty: mixed",
    ])
      expect(request.input).toContain(text);
    expect(request.instructions).toContain("only in answerKey");
    expect(request.text.format.type).toBe("json_schema");
  });
  it("repairs a mismatched key once and returns the validated result", async () => {
    live();
    const content = createMockWorksheet(source);
    parse
      .mockResolvedValueOnce({
        output_parsed: { ...content, answerKey: content.answerKey.slice(1) },
      })
      .mockResolvedValueOnce({ output_parsed: content });
    expect(await generateWorksheet(source)).toEqual(content);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][0].instructions).toContain(
      "one answer-key entry per question",
    );
  });
  it("does not add a paid repair for API failures", async () => {
    live();
    parse.mockRejectedValueOnce(
      new OpenAI.APIError(
        undefined,
        undefined,
        "Provider unavailable",
        undefined,
      ),
    );
    await expect(generateWorksheet(source)).rejects.toBeInstanceOf(
      OpenAI.APIError,
    );
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it("bounds invalid-output repairs to two attempts", async () => {
    live();
    parse.mockResolvedValue({ output_parsed: null });
    await expect(generateWorksheet(source)).rejects.toThrow("Empty structured");
    expect(parse).toHaveBeenCalledTimes(2);
  });
});
