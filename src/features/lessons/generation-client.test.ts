import { describe, expect, it, vi } from "vitest";
import {
  checkLessonIntent,
  submitLessonIntent,
  lessonIntentRecoverySchema,
  LessonGenerationError,
  type LessonIntent,
} from "./generation-client";

const expectedUid = "teacher-who-saved-this-request";

const intent: LessonIntent = {
  kind: "create",
  payload: {
    requestId: "7b850452-c06f-42b0-89aa-d773b6f8d630",
    count: 2,
    source: {
      subject: "Science",
      gradeLevel: "Grade 5",
      topic: "Local habitats",
      durationMinutes: 50,
      teachingStyle: "balanced",
      objectives: "",
      standards: "",
      studentNeeds: "",
    },
  },
};
const batch = {
  status: "partial",
  hasMore: true,
  lessons: [{ id: "saved-one" }],
  items: [
    { index: 0, status: "complete", lessonId: "saved-one" },
    { index: 1, status: "not-started", lessonId: null },
  ],
};
describe("lesson request transport", () => {
  it("stops a batch on a platform budget failure and preserves its completed and unstarted items", async () => {
    const partial = {
      ...batch,
      items: [
        batch.items[0],
        {
          index: 1,
          status: "failed",
          lessonId: null,
          error: "ai-budget-exhausted",
        },
        { index: 2, status: "not-started", lessonId: null },
      ],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(partial)));
    expect(
      await submitLessonIntent(intent, expectedUid, fetcher),
    ).toMatchObject({
      status: "failed",
      error: "ai-budget-exhausted",
      lessons: batch.lessons,
      batch: partial,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps the same ID and full payload across continuation or a lost response", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network interrupted"))
      .mockResolvedValue(new Response(JSON.stringify(batch)));
    await expect(
      submitLessonIntent(intent, expectedUid, fetcher),
    ).rejects.toThrow("Network interrupted");
    expect(
      await submitLessonIntent(intent, expectedUid, fetcher),
    ).toMatchObject({
      status: "paused",
      lessons: batch.lessons,
    });
    expect(fetcher.mock.calls[0][0]).toEqual(fetcher.mock.calls[1][0]);
    expect(fetcher.mock.calls[0][1].body).toEqual(
      fetcher.mock.calls[1][1].body,
    );
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(intent.payload);
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({
      "X-Vista-Expected-Uid": expectedUid,
    });
  });
  it("checks the ledger without a mutation or new request identity", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ...batch, status: "complete", hasMore: false }),
        ),
      );
    expect(await checkLessonIntent(intent, expectedUid, fetcher)).toMatchObject(
      {
        status: "complete",
      },
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/ai-lessons/batches/${intent.payload.requestId}`,
      expect.objectContaining({
        cache: "no-store",
        headers: { "X-Vista-Expected-Uid": expectedUid },
      }),
    );
  });
  it("does not treat a removed completed lesson as recoverable content", async () => {
    const single: LessonIntent = {
      ...intent,
      payload: { ...intent.payload, count: 1 },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "complete", lesson: null })),
      );
    expect(await checkLessonIntent(single, expectedUid, fetcher)).toMatchObject(
      {
        status: "failed",
        lessons: [],
      },
    );
  });
  it("binds regeneration and single-request checks to the original teacher", async () => {
    const regenerate: LessonIntent = {
      kind: "regenerate",
      lessonId: "saved-lesson",
      payload: { requestId: intent.payload.requestId, expectedVersion: 3 },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "saved-lesson" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "pending", lesson: null })),
      );
    await submitLessonIntent(regenerate, expectedUid, fetcher);
    await checkLessonIntent(regenerate, expectedUid, fetcher);
    expect(fetcher.mock.calls.map(([, options]) => options.headers)).toEqual([
      {
        "Content-Type": "application/json",
        "X-Vista-Expected-Uid": expectedUid,
      },
      { "X-Vista-Expected-Uid": expectedUid },
    ]);
  });
  it("preserves the account-change rejection instead of interpreting it as missing work", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Your account changed. Reload before continuing.",
          code: "account-changed",
        }),
        { status: 409 },
      ),
    );
    await expect(
      checkLessonIntent(intent, expectedUid, fetcher),
    ).rejects.toMatchObject({
      code: "account-changed",
    } satisfies Partial<LessonGenerationError>);
  });
  it("validates restored requests before they can be sent", () => {
    expect(lessonIntentRecoverySchema.safeParse({ intent }).success).toBe(true);
    expect(
      lessonIntentRecoverySchema.safeParse({
        intent: {
          ...intent,
          payload: { ...intent.payload, requestId: "other-user-path" },
        },
      }).success,
    ).toBe(false);
  });
});
