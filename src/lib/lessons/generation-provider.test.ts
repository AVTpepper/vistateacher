import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockLesson } from "./mock-provider";
import { generateLessonPlan } from "./provider";
import { lessonSourceSchema } from "@/schemas/lesson";

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
const source = lessonSourceSchema.parse({
  subject: "Music",
  gradeLevel: "Ages 8–10",
  topic: "Local folk songs",
  durationMinutes: 40,
  teachingStyle: "inquiry",
  curriculum: "Lgr22",
  language: "Swedish",
  classSize: 24,
  availableMaterials: "Paper and pencils, no devices",
  additionalInstructions: "Listen outdoors",
});

describe("structured lesson generation", () => {
  it("forwards teacher context to the configured provider", async () => {
    vi.stubEnv("AI_PROVIDER", "OPENAI");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-unused");
    parse.mockResolvedValueOnce({ output_parsed: createMockLesson(source) });
    await generateLessonPlan(source);
    const request = parse.mock.calls[0][0];
    for (const value of [
      "Lgr22",
      "Swedish",
      "24",
      "Paper and pencils, no devices",
      "Listen outdoors",
    ])
      expect(request.input).toContain(value);
    expect(request.instructions).toContain("Preserve the supplied subject");
  });
  it("gives a single repair attempt the timing validation error", async () => {
    vi.stubEnv("AI_PROVIDER", "OPENAI");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-unused");
    const lesson = createMockLesson(source);
    parse
      .mockResolvedValueOnce({
        output_parsed: {
          ...lesson,
          mainActivity: { ...lesson.mainActivity, durationMinutes: 10 },
        },
      })
      .mockResolvedValueOnce({ output_parsed: lesson });
    expect(await generateLessonPlan(source)).toEqual(lesson);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1][0].instructions).toContain(
      "must total 40 minutes",
    );
  });
});
