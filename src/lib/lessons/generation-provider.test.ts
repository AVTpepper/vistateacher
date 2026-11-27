import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import { createMockLesson } from "./mock-provider";
import { generateLessonPlan, prepareLessonResponse } from "./provider";
import { lessonSourceSchema } from "@/schemas/lesson";

const { metered } = vi.hoisted(() => ({ metered: vi.fn() }));
vi.mock("@/lib/ai/metered-responses", async (original) => ({
  ...(await original<typeof import("@/lib/ai/metered-responses")>()),
  meteredResponse: metered,
}));
const source = lessonSourceSchema.parse({
  subject: "Music",
  gradeLevel: "Ages 8â€“10",
  topic: "Local folk songs",
  durationMinutes: 40,
  teachingStyle: "inquiry",
  curriculum: "Lgr22",
  language: "Swedish",
  classSize: 24,
  availableMaterials: "Paper and pencils, no devices",
  additionalInstructions: "Listen outdoors",
});
function context() {
  const prepared = prepareLessonResponse(source)!;
  return {
    prepared,
    spend: { id: "0".repeat(64), plan: prepared.plan },
    fence: async () => undefined,
  };
}
function raw(content: unknown): Response {
  // Provider validation consumes only this settled-response subset; money is tested in spend.test.ts.
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
  vi.stubEnv("OPENAI_LESSON_MODEL", "gpt-4.1-mini");
  metered.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("structured lesson generation through the money boundary", () => {
  it("freezes the teacher context and passes only its reserved context to the adapter", async () => {
    const reserved = context();
    const lesson = createMockLesson(source);
    metered.mockResolvedValue(raw(lesson));
    expect(await generateLessonPlan(source, {}, reserved)).toEqual(lesson);
    const request = JSON.parse(reserved.prepared.json);
    for (const value of [
      "Lgr22",
      "Swedish",
      "24",
      "Paper and pencils, no devices",
      "Listen outdoors",
    ])
      expect(request.input).toContain(value);
    expect(request.instructions).toContain("Preserve the supplied subject");
    expect(request.max_output_tokens).toBe(8000);
    expect(metered).toHaveBeenCalledExactlyOnceWith(reserved);
  });
  it("stops after invalid timing without an automatic paid repair", async () => {
    const lesson = createMockLesson(source);
    metered.mockResolvedValue(
      raw({
        ...lesson,
        mainActivity: { ...lesson.mainActivity, durationMinutes: 10 },
      }),
    );
    await expect(generateLessonPlan(source, {}, context())).rejects.toThrow(
      "must total 40 minutes",
    );
    expect(metered).toHaveBeenCalledTimes(1);
  });
  it("requires a reserved spend context before requesting paid output", async () => {
    await expect(generateLessonPlan(source)).rejects.toMatchObject({
      code: "ai-unavailable",
    });
    expect(metered).not.toHaveBeenCalled();
  });
});
