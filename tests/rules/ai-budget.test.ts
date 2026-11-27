import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";
import { NextRequest, NextResponse } from "next/server";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/auth/route-account", () => ({
  getRouteAccount: async () => ({
    uid: "budget-worksheet-teacher",
    status: "active",
  }),
}));
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = { create: sdk.create };
  },
}));
import { adminDb } from "@/lib/firebase/admin";
import { createLesson } from "@/lib/lessons/server";
import { createWorksheet } from "@/lib/worksheets/server";
import { worksheetRoute } from "@/lib/worksheets/route";
import { createMockLesson } from "@/lib/lessons/mock-provider";
import { createMockWorksheet } from "@/lib/worksheets/mock-provider";
import { lessonSourceSchema } from "@/schemas/lesson";
import { worksheetSourceSchema } from "@/schemas/worksheet";
import {
  BUDGET_PATH,
  CEILING_NANO_USD,
  EVAL_CEILING_NANO_USD,
  CALL_RESERVE_NANO_USD,
  RATE_REVISION,
} from "@/lib/ai/spend";

let environment: RulesTestEnvironment;
const lessonUid = "budget-lesson-teacher",
  worksheetUid = "budget-worksheet-teacher";
const lessonSource = lessonSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Local habitats",
  durationMinutes: 50,
  teachingStyle: "balanced",
  studentNeeds: "SYNTHETIC_PRIVATE_CONTEXT",
  language: "English",
});
const worksheetSource = worksheetSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Local habitats",
  language: "English",
  difficulty: "core",
  studentNeeds: "SYNTHETIC_PRIVATE_CONTEXT",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 1,
    extendedResponse: 0,
    matching: 0,
    fillInBlank: 0,
    trueFalse: 0,
  },
});
const usageRef = (uid: string) =>
  adminDb().doc(`usage/${uid}_${new Date().toISOString().slice(0, 7)}`);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function paidResponse(body: ResponseCreateParamsNonStreaming) {
  if (body.text?.format?.type !== "json_schema")
    throw new Error("Expected strict response schema");
  const content =
    body.text.format.name === "lesson_plan"
      ? createMockLesson(lessonSource)
      : createMockWorksheet(worksheetSource);
  return {
    id: "resp_synthetic",
    _request_id: "req_synthetic",
    model: "gpt-4.1-mini-2025-04-14",
    service_tier: "default",
    status: "completed",
    error: null,
    incomplete_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      total_tokens: 1100,
      input_tokens_details: { cached_tokens: 100 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(content) }],
      },
    ],
  };
}
beforeAll(async () => {
  if (
    !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(
      process.env.FIRESTORE_EMULATOR_HOST ?? "",
    )
  )
    throw new Error(
      "An explicit local demo Firestore emulator is required; refusing external database.",
    );
  adminDb();
  if (getApp().options.projectId !== "demo-vista-teacher")
    throw new Error(
      "The Admin SDK must use the isolated demo-vista-teacher project.",
    );
  environment = await initializeTestEnvironment({
    projectId: "demo-vista-teacher",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-26T12:00:00Z"));
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-nonfunctional-key");
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_approved_demo_fixture");
  vi.stubEnv("OPENAI_BUDGET_EPOCH", "demo_fixture_epoch");
  vi.stubEnv("OPENAI_LESSON_MODEL", "gpt-4.1-mini");
  vi.stubEnv("OPENAI_WORKSHEET_MODEL", "gpt-4.1-mini");
  // Date.now is fixed ONLY for this retired-model fixture, never production policy.
  // Real emulator timers remain active; production rejects mini on/after Jan 14, 2027.
  for (const uid of [lessonUid, worksheetUid]) {
    await adminDb().doc(`users/${uid}`).set({
      status: "active",
      displayName: "Synthetic teacher",
      resourceCount: 0,
    });
    await adminDb()
      .doc(`subscriptions/${uid}`)
      .set({ plan: "plus", status: "active" });
    await usageRef(uid).set({
      aiLessons: 0,
      lastAiLessonAt: Timestamp.fromMillis(0),
    });
  }
  await adminDb()
    .doc(BUDGET_PATH)
    .set({
      schemaVersion: 1,
      projectId: "proj_approved_demo_fixture",
      epochId: "demo_fixture_epoch",
      enabled: true,
      auditStatus: "approved-dedicated-project",
      auditRef: "TEST-FIXTURE-NOT-A-REAL-AUDIT",
      auditedAt: Timestamp.now(),
      providerHardLimitNanoUsd: 25_000_000_000,
      rateRevision: RATE_REVISION,
      ceiling: CEILING_NANO_USD,
      evaluationCeiling: EVAL_CEILING_NANO_USD,
      known: CEILING_NANO_USD - CALL_RESERVE_NANO_USD,
      held: 0,
      uncertain: 0,
      imported: 0,
      evaluationKnown: 0,
      evaluationHeld: 0,
      evaluationUncertain: 0,
      evaluationImported: 0,
    });
  sdk.create.mockReset();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await environment.clearFirestore();
});
afterAll(async () => {
  await environment.cleanup();
});

describe("atomic money + teacher action + durable job reservation", () => {
  it("rejects an old teacher's worksheet tab after account switch before creating or charging the new account", async () => {
    const requestId = randomUUID();
    const action = vi.fn(async (uid: string) =>
      NextResponse.json(await createWorksheet(uid, worksheetSource, requestId)),
    );
    const response = await worksheetRoute(
      new NextRequest("https://vista.test/api/worksheets", {
        method: "POST",
        headers: {
          Origin: "https://vista.test",
          Host: "vista.test",
          "X-Vista-Expected-Uid": lessonUid,
        },
      }),
      action,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "account-changed" });
    expect(action).not.toHaveBeenCalled();
    expect(sdk.create).not.toHaveBeenCalled();
    expect((await usageRef(worksheetUid).get()).data()?.aiLessons).toBe(0);
    expect(
      (
        await adminDb()
          .doc(`worksheetGenerationRequests/${worksheetUid}_${requestId}`)
          .get()
      ).exists,
    ).toBe(false);
    expect((await adminDb().collection("aiSpendAttempts").get()).size).toBe(0);
    expect((await adminDb().doc(BUDGET_PATH).get()).data()?.held).toBe(0);
  });
  it("lets exactly one lesson/worksheet caller race for the final $0.45, and replay never dispatches twice", async () => {
    const gate = deferred();
    sdk.create.mockImplementation(
      async (body: ResponseCreateParamsNonStreaming) => {
        await gate.promise; // Hold reserved money while the opposing transaction retries.
        return paidResponse(body);
      },
    );
    const lessonId = randomUUID(),
      worksheetId = randomUUID();
    const calls = [
      {
        kind: "lesson",
        uid: lessonUid,
        requestId: lessonId,
        invoke: () => createLesson(lessonUid, lessonSource, lessonId),
      },
      {
        kind: "worksheet",
        uid: worksheetUid,
        requestId: worksheetId,
        invoke: () =>
          createWorksheet(worksheetUid, worksheetSource, worksheetId),
      },
    ];
    type Call = (typeof calls)[number];
    type Result = {
      call: Call;
      value?: Awaited<ReturnType<Call["invoke"]>>;
      error?: unknown;
    };
    const failures: { call: Call; error: unknown }[] = [];
    // Attach handlers immediately, avoiding an unhandled losing promise while winner is gated.
    const running: Promise<Result>[] = calls.map(async (call) => {
      try {
        return { call, value: await call.invoke() };
      } catch (error) {
        failures.push({ call, error });
        return { call, error };
      }
    });
    try {
      // Real Firestore transaction contention retries use backoff that can exceed
      // Vitest's one-second polling default; wait for the actual durable outcome.
      await vi.waitFor(() => expect(sdk.create).toHaveBeenCalledTimes(1), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(failures).toHaveLength(1), {
        timeout: 10_000,
      });
      expect(failures[0].error).toMatchObject({ code: "ai-budget-exhausted" });
      const winner = calls.find((call) => call !== failures[0].call)!;
      const loser = failures[0].call;
      expect((await usageRef(winner.uid).get()).data()?.aiLessons).toBe(1);
      expect((await usageRef(loser.uid).get()).data()?.aiLessons).toBe(0);
      expect((await adminDb().doc(BUDGET_PATH).get()).data()?.held).toBe(
        CALL_RESERVE_NANO_USD,
      );
      expect((await adminDb().collection("aiSpendAttempts").get()).size).toBe(
        1,
      );
      const loserCollection =
        loser.kind === "lesson"
          ? "lessonGenerationRequests"
          : "worksheetGenerationRequests";
      expect(
        (
          await adminDb()
            .doc(`${loserCollection}/${loser.uid}_${loser.requestId}`)
            .get()
        ).exists,
      ).toBe(false);
      await expect(winner.invoke()).rejects.toMatchObject({ code: "busy" });
      expect(sdk.create).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await Promise.all(running);
    }
    const settled = await Promise.all(running);
    const completed = settled.find((result) => result.value)!;
    expect((await completed.call.invoke()).id).toBe(completed.value!.id);
    expect(sdk.create).toHaveBeenCalledTimes(1);
    const money = (await adminDb().doc(BUDGET_PATH).get()).data()!;
    expect(money.known).toBe(
      CEILING_NANO_USD - CALL_RESERVE_NANO_USD + 530_000,
    );
    expect(money.held).toBe(0);
    expect(money.uncertain).toBe(0);
    expect((await usageRef(completed.call.uid).get()).data()?.aiLessons).toBe(
      1,
    );
    expect(
      JSON.stringify(
        (await adminDb().collection("aiSpendAttempts").get()).docs.map((doc) =>
          doc.data(),
        ),
      ),
    ).not.toContain("SYNTHETIC_PRIVATE_CONTEXT");
  });
  it.each([
    ["lesson", "removed-key"],
    ["worksheet", "removed-key"],
    ["lesson", "retired-model"],
    ["worksheet", "retired-model"],
    ["lesson", "paused-budget"],
    ["worksheet", "paused-budget"],
  ])(
    "replays pending/completed %s work after %s before evaluating paid configuration",
    async (kind, condition) => {
      const gate = deferred();
      const fixtureNow = Date.now();
      const uid = kind === "lesson" ? lessonUid : worksheetUid;
      const requestId = randomUUID();
      const invoke = () =>
        kind === "lesson"
          ? createLesson(uid, lessonSource, requestId)
          : createWorksheet(uid, worksheetSource, requestId);
      sdk.create.mockImplementation(
        async (body: ResponseCreateParamsNonStreaming) => {
          await gate.promise;
          return paidResponse(body);
        },
      );
      const running = invoke();
      // Attach a rejection handler while the fake provider remains gated.
      void running.catch(() => undefined);
      try {
        await vi.waitFor(() => expect(sdk.create).toHaveBeenCalledTimes(1), {
          timeout: 10_000,
        });
        if (condition === "removed-key") vi.stubEnv("OPENAI_API_KEY", "");
        else if (condition === "retired-model")
          vi.mocked(Date.now).mockReturnValue(
            Date.parse("2027-01-14T00:00:00Z"),
          );
        else await adminDb().doc(BUDGET_PATH).update({ enabled: false });
        await expect(invoke()).rejects.toMatchObject({ code: "busy" });
        expect(sdk.create).toHaveBeenCalledTimes(1);
        expect((await usageRef(uid).get()).data()?.aiLessons).toBe(1);
      } finally {
        // Retirement advances past the domain lease as well. Finish this already
        // dispatched fixture within its lease, then retire again for completed replay.
        if (condition === "retired-model")
          vi.mocked(Date.now).mockReturnValue(fixtureNow);
        gate.resolve();
        await running.catch(() => undefined);
      }
      // A response dispatched before pause/removal/retirement still settles and saves.
      const completed = await running;
      if (condition === "retired-model")
        vi.mocked(Date.now).mockReturnValue(Date.parse("2027-01-14T00:00:00Z"));
      expect((await invoke()).id).toBe(completed.id);
      expect(sdk.create).toHaveBeenCalledTimes(1);
      const money = (await adminDb().doc(BUDGET_PATH).get()).data()!;
      expect(money.known).toBe(
        CEILING_NANO_USD - CALL_RESERVE_NANO_USD + 530_000,
      );
      expect(money.held).toBe(0);
      expect(money.uncertain).toBe(0);
      expect((await usageRef(uid).get()).data()?.aiLessons).toBe(1);
    },
  );
  it("denies monetary records to teachers and client-side admins", async () => {
    const teacher = environment.authenticatedContext(lessonUid).firestore();
    const admin = environment
      .authenticatedContext("synthetic-admin", { admin: true })
      .firestore();
    for (const client of [teacher, admin]) {
      await assertFails(getDoc(doc(client, BUDGET_PATH)));
      await assertFails(getDoc(doc(client, "aiSpendAttempts", "0".repeat(64))));
    }
  });
});
