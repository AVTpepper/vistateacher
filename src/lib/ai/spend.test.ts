import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";
import type { SpendHandle, Workload } from "@/lib/ai/spend";

type FakeRef = { path: string; id: string | undefined };
type FakeSnapshot = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  ref: FakeRef;
};
interface FakeTransaction {
  get(ref: FakeRef): Promise<FakeSnapshot>;
  getAll(...refs: FakeRef[]): Promise<FakeSnapshot[]>;
  create(ref: FakeRef, value: Record<string, unknown>): void;
  update(ref: FakeRef, value: Record<string, unknown>): void;
}
interface BudgetFixture {
  known: number;
  held: number;
  uncertain: number;
  imported: number;
  evaluationKnown: number;
  evaluationHeld: number;
  evaluationUncertain: number;
  evaluationImported: number;
  enabled: boolean;
}

const fake = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  let queue = Promise.resolve();
  let loseNextCommitAck = false;
  const db = {
    doc: (path: string) => ({ path, id: path.split("/").at(-1) }),
    runTransaction: async <T>(
      callback: (transaction: FakeTransaction) => Promise<T>,
    ): Promise<T> => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const staged = new Map(documents);
        let writing = false;
        const snapshot = (ref: FakeRef): FakeSnapshot => {
          if (writing) throw new Error("Firestore read after write");
          const value = staged.get(ref.path);
          return { exists: !!value, data: () => value, ref };
        };
        const transaction: FakeTransaction = {
          get: async (ref) => snapshot(ref),
          getAll: async (...refs) => refs.map(snapshot),
          create: (ref, value) => {
            writing = true;
            if (staged.has(ref.path)) throw new Error("already exists");
            staged.set(ref.path, value);
          },
          update: (ref, value) => {
            writing = true;
            if (!staged.has(ref.path)) throw new Error("not found");
            staged.set(ref.path, { ...staged.get(ref.path), ...value });
          },
        };
        const result = await callback(transaction);
        documents.clear();
        for (const [key, value] of staged) documents.set(key, value);
        if (loseNextCommitAck) {
          loseNextCommitAck = false;
          throw new Error("commit acknowledgement lost");
        }
        return result;
      } finally {
        release();
      }
    },
  };
  return {
    db,
    documents,
    loseAck: () => {
      loseNextCommitAck = true;
    },
    reset: () => {
      documents.clear();
      loseNextCommitAck = false;
    },
  };
});
const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  options: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => fake.db }));
vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = { create: sdk.create };
    constructor(options: Record<string, unknown>) {
      sdk.options.push(options);
    }
  },
}));

import {
  AiSpendError,
  RATE_REVISION,
  BUDGET_PATH,
  CEILING_NANO_USD,
  EVAL_CEILING_NANO_USD,
  CALL_RESERVE_NANO_USD,
  reserve,
  beginDispatch,
  measuredReceipt,
  settle,
  abandon,
} from "@/lib/ai/spend";
import {
  meteredResponse,
  prepareResponse,
  structuredJson,
} from "@/lib/ai/metered-responses";
import { generateLessonPlan } from "@/lib/lessons/provider";
import { generateWorksheet } from "@/lib/worksheets/provider";

const budget = () =>
  fake.documents.get(BUDGET_PATH)! as unknown as BudgetFixture;
const attempt = (handle: SpendHandle) =>
  fake.documents.get(`aiSpendAttempts/${handle.id}`)!;
const response = (overrides: Record<string, unknown> = {}) => ({
  id: "resp_fake",
  _request_id: "req_fake",
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
      content: [{ type: "output_text", text: '{"ok":true}' }],
    },
  ],
  ...overrides,
});
const prepare = (
  purpose: "product" | "evaluation" = "product",
  workload: Workload = "lesson",
) =>
  prepareResponse(
    workload,
    {
      instructions: "Synthetic teacher instructions",
      input: "Synthetic teaching context only",
      format: {
        type: "json_schema",
        name: "fixture",
        strict: true,
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    },
    purpose,
  );
async function context(
  key = "opaque-attempt-1",
  purpose: "product" | "evaluation" = "product",
  workload: Workload = "lesson",
) {
  const prepared = prepare(purpose, workload);
  const spend = await fake.db.runTransaction((tx) =>
    reserve(
      tx as unknown as Transaction,
      prepared.plan,
      key,
      Timestamp.fromMillis(Date.now() + 600_000),
    ),
  );
  const fence = vi.fn(async () => undefined);
  return { prepared, spend, fence };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("OPENAI_API_KEY", "test-nonfunctional-key");
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_synthetic");
  vi.stubEnv("OPENAI_BUDGET_EPOCH", "pilot_2026_11");
  vi.stubEnv("OPENAI_LESSON_MODEL", "gpt-4.1-mini");
  vi.stubEnv("OPENAI_WORKSHEET_MODEL", "gpt-4.1-mini");
  fake.reset();
  sdk.create.mockReset();
  sdk.options.length = 0;
  fake.documents.set(BUDGET_PATH, {
    schemaVersion: 1,
    projectId: "proj_synthetic",
    epochId: "pilot_2026_11",
    enabled: true,
    auditStatus: "approved-dedicated-project",
    auditRef: "synthetic-test-only",
    auditedAt: Timestamp.now(),
    providerHardLimitNanoUsd: 25_000_000_000,
    rateRevision: RATE_REVISION,
    ceiling: CEILING_NANO_USD,
    evaluationCeiling: EVAL_CEILING_NANO_USD,
    known: 0,
    held: 0,
    uncertain: 0,
    imported: 0,
    evaluationKnown: 0,
    evaluationHeld: 0,
    evaluationUncertain: 0,
    evaluationImported: 0,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("global pilot money ledger", () => {
  it("atomically admits only one final reservation across concurrent users/tools", async () => {
    budget().known = CEILING_NANO_USD - CALL_RESERVE_NANO_USD;
    const results = await Promise.allSettled([
      context("user-a-job", "product", "lesson"),
      context("user-b-job", "product", "worksheet"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      budget().known + budget().held + budget().uncertain + budget().imported,
    ).toBe(CEILING_NANO_USD);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("does not reopen money when teacher quotas are refunded or UTC month changes", async () => {
    budget().known = CEILING_NANO_USD;
    fake.documents.set("usage/teacher_2026-11", { aiLessons: 0 }); // teacher action refund is independent
    vi.setSystemTime(new Date("2026-12-01T00:01:00Z"));
    await expect(context()).rejects.toMatchObject({
      code: "ai-budget-exhausted",
    });
    expect(budget().known).toBe(CEILING_NANO_USD);
  });
  it("enforces evaluation allowance as a subset, never extra dollars", async () => {
    budget().evaluationKnown = EVAL_CEILING_NANO_USD - CALL_RESERVE_NANO_USD;
    budget().known = budget().evaluationKnown;
    await context("eval-1", "evaluation");
    await expect(context("eval-2", "evaluation")).rejects.toMatchObject({
      code: "ai-budget-exhausted",
    });
    expect(budget().held).toBe(CALL_RESERVE_NANO_USD);
    expect(budget().evaluationHeld).toBe(CALL_RESERVE_NANO_USD);
  });
  it("requires audited project configuration and a reviewed live model/rate", async () => {
    fake.documents.delete(BUDGET_PATH);
    await expect(context()).rejects.toMatchObject({ code: "ai-unavailable" });
    vi.stubEnv("OPENAI_PROJECT_ID", "");
    expect(() => prepare()).toThrow(AiSpendError);
    vi.stubEnv("OPENAI_PROJECT_ID", "proj_synthetic");
    vi.stubEnv("OPENAI_LESSON_MODEL", "unapproved-model");
    expect(() => prepare()).toThrow(AiSpendError);
    vi.stubEnv("OPENAI_LESSON_MODEL", "gpt-4.1-mini");
    vi.setSystemTime(new Date("2027-01-14T00:00:00Z"));
    expect(() => prepare()).toThrow(AiSpendError);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("grants dispatch once and never replays after a lost commit acknowledgement", async () => {
    const first = await context();
    fake.loseAck();
    await expect(beginDispatch(first.spend, first.fence)).rejects.toThrow(
      "acknowledgement",
    );
    await expect(beginDispatch(first.spend, first.fence)).rejects.toMatchObject(
      { code: "ai-dispatch-conflict" },
    );
    expect(sdk.create).not.toHaveBeenCalled();
    await abandon(first.spend.id);
    expect(budget().held).toBe(0);
    expect(budget().uncertain).toBe(CALL_RESERVE_NANO_USD);
  });
  it("rejects an expired/stolen domain fence without dispatch; independent cleanup releases only unstarted money", async () => {
    const first = await context();
    first.fence.mockRejectedValue(new Error("stale artifact/batch/account"));
    await expect(meteredResponse(first)).rejects.toThrow(
      "stale artifact/batch/account",
    );
    expect(attempt(first.spend).state).toBe("reserved");
    expect(sdk.create).not.toHaveBeenCalled();
    await abandon(first.spend.id);
    await abandon(first.spend.id);
    expect(budget().held).toBe(0);
    expect(budget().known).toBe(0);
  });
  it("settles a late response after account/artifact deletion and uncertainty, exactly once", async () => {
    const first = await context();
    const grant = await beginDispatch(first.spend, first.fence);
    await abandon(first.spend.id);
    fake.documents.delete("users/teacher");
    fake.documents.delete("lessons/artifact");
    const receipt = measuredReceipt(response(), first.spend.plan);
    await settle(grant, receipt);
    await settle(grant, receipt);
    await abandon(first.spend.id);
    expect(budget().known).toBe(530_000);
    expect(budget().held).toBe(0);
    expect(budget().uncertain).toBe(0);
    expect(attempt(first.spend).state).toBe("settled");
    expect(fake.documents.has("users/teacher")).toBe(false);
    expect(JSON.stringify([...fake.documents])).not.toContain(
      "Synthetic teaching context",
    );
  });
});

describe("single paid-call adapter (all transport mocked)", () => {
  it("settles raw usage before invalid structured JSON throws, without a repair call", async () => {
    const first = await context();
    sdk.create.mockResolvedValue(
      response({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "invalid JSON" }],
          },
        ],
      }),
    );
    const raw = await meteredResponse(first);
    expect(budget().known).toBe(530_000); // durable before downstream parsing
    expect(() => structuredJson(raw)).toThrow();
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.options[0]).toMatchObject({
      project: "proj_synthetic",
      maxRetries: 0,
      baseURL: "https://api.openai.com/v1",
    });
    expect(sdk.create.mock.calls[0][0]).toMatchObject({
      store: false,
      service_tier: "default",
      max_output_tokens: 8000,
    });
  });
  it("keeps known cost after a lost settlement acknowledgement without another send", async () => {
    const first = await context();
    sdk.create.mockImplementation(async () => {
      fake.loseAck();
      return response();
    });
    await expect(meteredResponse(first)).rejects.toMatchObject({
      code: "ai-accounting-pending",
    });
    expect(budget().known).toBe(530_000);
    expect(budget().held).toBe(0);
    expect(budget().uncertain).toBe(0);
    expect(attempt(first.spend).state).toBe("settled");
    await expect(meteredResponse(first)).rejects.toMatchObject({
      code: "ai-dispatch-conflict",
    });
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    new Error("timeout"),
    Object.assign(new Error("429 provider spend limit"), { status: 429 }),
    new Error("malformed HTTP response body"),
  ])(
    "makes one physical call on a transport/API/body error and keeps its full uncertain hold: %s",
    async (error) => {
      const first = await context();
      sdk.create.mockRejectedValue(error);
      await expect(meteredResponse(first)).rejects.toMatchObject({
        code: "ai-accounting-pending",
      });
      expect(sdk.create).toHaveBeenCalledTimes(1);
      expect(budget().known).toBe(0);
      expect(budget().uncertain).toBe(CALL_RESERVE_NANO_USD);
      await expect(meteredResponse(first)).rejects.toMatchObject({
        code: "ai-dispatch-conflict",
      });
      expect(sdk.create).toHaveBeenCalledTimes(1);
    },
  );
  it("pauses on an unpriced returned model rather than treating it as free", async () => {
    const first = await context();
    sdk.create.mockResolvedValue(response({ model: "unpriced-model" }));
    await expect(meteredResponse(first)).rejects.toMatchObject({
      code: "ai-accounting-pending",
    });
    expect(budget().enabled).toBe(false);
    expect(budget().uncertain).toBe(CALL_RESERVE_NANO_USD);
  });
  it.each([
    { service_tier: "priority" },
    { usage: null },
    {
      usage: {
        ...response().usage,
        input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 },
      },
    },
    { usage: { ...response().usage, output_tokens: 8001, total_tokens: 9001 } },
  ])(
    "pauses and retains the full bound for an unapproved usage/price dimension",
    async (invalid) => {
      const first = await context();
      sdk.create.mockResolvedValue(response(invalid));
      await expect(meteredResponse(first)).rejects.toMatchObject({
        code: "ai-accounting-pending",
      });
      expect(budget().enabled).toBe(false);
      expect(budget().known).toBe(0);
      expect(budget().uncertain).toBe(CALL_RESERVE_NANO_USD);
      expect(sdk.create).toHaveBeenCalledTimes(1);
    },
  );
  it("pauses both tools on a provider spend-limit error while retaining the dispatched bound", async () => {
    const first = await context();
    sdk.create.mockRejectedValue(
      Object.assign(new Error("Synthetic provider limit"), {
        status: 429,
        code: "project_spend_limit_exceeded",
      }),
    );
    await expect(meteredResponse(first)).rejects.toMatchObject({
      code: "ai-accounting-pending",
    });
    expect(budget().enabled).toBe(false);
    expect(budget().uncertain).toBe(CALL_RESERVE_NANO_USD);
    await expect(
      context("worksheet-after-provider-limit", "product", "worksheet"),
    ).rejects.toMatchObject({ code: "ai-unavailable" });
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
  it("caps worksheet output at 16000 and never stores prompts in financial records", async () => {
    const first = await context("worksheet", "product", "worksheet");
    sdk.create.mockResolvedValue(response());
    await meteredResponse(first);
    expect(sdk.create.mock.calls[0][0]).toMatchObject({
      max_output_tokens: 16000,
      store: false,
    });
    expect(JSON.stringify(attempt(first.spend))).not.toContain("Synthetic");
  });
  it("rejects direct paid provider generation without a reserved spend context", async () => {
    await expect(generateLessonPlan({} as never)).rejects.toMatchObject({
      code: "ai-unavailable",
    });
    await expect(generateWorksheet({} as never)).rejects.toMatchObject({
      code: "ai-unavailable",
    });
    expect(sdk.create).not.toHaveBeenCalled();
  });
});
