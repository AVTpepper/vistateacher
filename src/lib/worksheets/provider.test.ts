import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import { generateWorksheet, prepareWorksheetResponse } from "./provider";
import { createMockWorksheet } from "./mock-provider";
import { worksheetSourceSchema } from "@/schemas/worksheet";
import { AiSpendError } from "@/lib/ai/spend";

const { metered } = vi.hoisted(() => ({ metered: vi.fn() }));
vi.mock("@/lib/ai/metered-responses", async (original) => ({
  ...(await original<typeof import("@/lib/ai/metered-responses")>()),
  meteredResponse: metered,
}));
const source = worksheetSourceSchema.parse({
  subject: "Music",
  gradeLevel: "Ages 8â€“10",
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
function context() {
  const prepared = prepareWorksheetResponse(source)!;
  return {
    prepared,
    spend: { id: "0".repeat(64), plan: prepared.plan },
    fence: async () => undefined,
  };
}
function raw(content: unknown): Response {
  return {
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(content) }],
      },
    ],
  } as unknown as Response;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused-key");
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_synthetic");
  vi.stubEnv("OPENAI_BUDGET_EPOCH", "synthetic_epoch");
  vi.stubEnv("OPENAI_WORKSHEET_MODEL", "gpt-4.1-mini");
  metered.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("structured worksheet generation through the money boundary", () => {
  it("freezes the exact question mix and all teacher context", async () => {
    const reserved = context();
    const content = createMockWorksheet(source);
    metered.mockResolvedValue(raw(content));
    expect(await generateWorksheet(source, undefined, reserved)).toEqual(
      content,
    );
    const request = JSON.parse(reserved.prepared.json);
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
    expect(request.max_output_tokens).toBe(16000);
    expect(metered).toHaveBeenCalledExactlyOnceWith(reserved);
  });
  it("stops after a mismatched answer key without an automatic paid repair", async () => {
    const content = createMockWorksheet(source);
    metered.mockResolvedValue(
      raw({ ...content, answerKey: content.answerKey.slice(1) }),
    );
    await expect(
      generateWorksheet(source, undefined, context()),
    ).rejects.toThrow("one answer-key entry per question");
    expect(metered).toHaveBeenCalledTimes(1);
  });
  it("propagates accounting uncertainty without a repair or fallback", async () => {
    metered.mockRejectedValue(new AiSpendError("ai-accounting-pending"));
    await expect(
      generateWorksheet(source, undefined, context()),
    ).rejects.toMatchObject({ code: "ai-accounting-pending" });
    expect(metered).toHaveBeenCalledTimes(1);
  });
  it("requires a reserved spend context before requesting paid output", async () => {
    await expect(generateWorksheet(source)).rejects.toMatchObject({
      code: "ai-unavailable",
    });
    expect(metered).not.toHaveBeenCalled();
  });
});
