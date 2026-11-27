import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";

export const RATE_REVISION = "2026-11-26-mini-standard-v1";
export const BUDGET_PATH = "aiBudgets/pilot";
export const CEILING_NANO_USD = 22_000_000_000;
export const EVAL_CEILING_NANO_USD = 1_000_000_000; // subset of $22
export const CALL_RESERVE_NANO_USD = 450_000_000;
const RETIRES_AT_MS = Date.parse("2027-01-14T00:00:00.000Z");
const MAX_INPUT_TOKENS = 1_047_576;
const REQUEST_MODELS = ["gpt-4.1-mini", "gpt-4.1-mini-2025-04-14"] as const;
const RETURNED_MODELS = new Set<string>(REQUEST_MODELS);
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const stamp = z.instanceof(Timestamp);

export type SpendErrorCode =
  | "ai-budget-exhausted"
  | "ai-unavailable"
  | "ai-dispatch-conflict"
  | "ai-accounting-pending";
export class AiSpendError extends Error {
  constructor(public readonly code: SpendErrorCode) {
    super(code);
  }
}
export type Workload = "lesson" | "worksheet";
type Purpose = "product" | "evaluation";

const budgetSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().regex(/^proj_[A-Za-z0-9_-]+$/),
  epochId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  enabled: z.boolean(),
  auditStatus: z.literal("approved-dedicated-project"),
  auditRef: z.string().min(1).max(160), // opaque review ID, no credentials
  auditedAt: stamp,
  providerHardLimitNanoUsd: z.literal(25_000_000_000),
  rateRevision: z.literal(RATE_REVISION),
  ceiling: z.literal(CEILING_NANO_USD),
  evaluationCeiling: z.literal(EVAL_CEILING_NANO_USD),
  known: amount,
  held: amount,
  uncertain: amount,
  imported: amount,
  evaluationKnown: amount,
  evaluationHeld: amount,
  evaluationUncertain: amount,
  evaluationImported: amount,
});
type Budget = z.infer<typeof budgetSchema>;
const receiptSchema = z.object({
  responseId: z.string().min(1).max(160),
  requestId: z.string().max(160).nullable(),
  model: z.enum(REQUEST_MODELS),
  serviceTier: z.literal("default"),
  inputTokens: amount,
  cachedInputTokens: amount,
  outputTokens: amount,
  cost: amount,
});
type Receipt = z.infer<typeof receiptSchema>;
const attemptSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string(),
  epochId: z.string(),
  rateRevision: z.literal(RATE_REVISION),
  workload: z.enum(["lesson", "worksheet"]),
  purpose: z.enum(["product", "evaluation"]),
  requestModel: z.enum(REQUEST_MODELS),
  payloadHash: digest,
  maxOutputTokens: z.union([z.literal(8_000), z.literal(16_000)]),
  bound: z.literal(CALL_RESERVE_NANO_USD),
  state: z.enum([
    "reserved",
    "dispatching",
    "uncertain",
    "settled",
    "released",
  ]),
  reservedUntil: stamp,
  dispatchNonce: z.string().uuid().optional(),
  receiptHash: digest.optional(),
  receipt: receiptSchema.optional(),
});
type Attempt = z.infer<typeof attemptSchema>;

export interface SpendPlan {
  projectId: string;
  epochId: string;
  rateRevision: typeof RATE_REVISION;
  workload: Workload;
  purpose: Purpose;
  requestModel: (typeof REQUEST_MODELS)[number];
  payloadHash: string;
  maxOutputTokens: 8_000 | 16_000;
}
export interface SpendHandle {
  id: string;
  plan: SpendPlan;
}
export interface DispatchGrant {
  handle: SpendHandle;
  nonce: string;
}
// The callback only READS domain documents. It must not write or make network calls.
export type DispatchFence = (transaction: Transaction) => Promise<void>;

function unavailable(): never {
  throw new AiSpendError("ai-unavailable");
}
function integer(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) unavailable();
  return value;
}
function total(budget: Budget, evaluation = false): number {
  return integer(
    evaluation
      ? budget.evaluationKnown +
          budget.evaluationHeld +
          budget.evaluationUncertain +
          budget.evaluationImported
      : budget.known + budget.held + budget.uncertain + budget.imported,
  );
}
function readBudget(value: unknown): Budget {
  const parsed = budgetSchema.safeParse(value);
  if (!parsed.success) unavailable();
  const budget = parsed.data;
  total(budget);
  total(budget, true);
  if (
    budget.evaluationKnown > budget.known ||
    budget.evaluationHeld > budget.held ||
    budget.evaluationUncertain > budget.uncertain ||
    budget.evaluationImported > budget.imported
  )
    unavailable();
  return budget;
}
function readAttempt(value: unknown): Attempt {
  const parsed = attemptSchema.safeParse(value);
  if (!parsed.success) unavailable();
  return parsed.data;
}
function config(now = Date.now()) {
  if (
    process.env.AI_PROVIDER !== "OPENAI" ||
    !process.env.OPENAI_API_KEY ||
    now >= RETIRES_AT_MS
  )
    unavailable();
  const projectId = process.env.OPENAI_PROJECT_ID ?? "";
  const epochId = process.env.OPENAI_BUDGET_EPOCH ?? "";
  if (
    !/^proj_[A-Za-z0-9_-]+$/.test(projectId) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(epochId)
  )
    unavailable();
  return { projectId, epochId };
}
export function createSpendPlan(
  workload: Workload,
  payloadHash: string,
  purpose: Purpose = "product",
): SpendPlan {
  const { projectId, epochId } = config();
  const model =
    workload === "worksheet"
      ? (process.env.OPENAI_WORKSHEET_MODEL ??
        process.env.OPENAI_LESSON_MODEL ??
        "gpt-4.1-mini")
      : (process.env.OPENAI_LESSON_MODEL ?? "gpt-4.1-mini");
  if (
    !REQUEST_MODELS.includes(model as (typeof REQUEST_MODELS)[number]) ||
    !digest.safeParse(payloadHash).success
  )
    unavailable();
  return {
    projectId,
    epochId,
    rateRevision: RATE_REVISION,
    workload,
    purpose,
    requestModel: model as (typeof REQUEST_MODELS)[number],
    payloadHash,
    maxOutputTokens: workload === "lesson" ? 8_000 : 16_000,
  };
}
function assertPlanActive(plan: SpendPlan, budget: Budget) {
  const active = config();
  if (
    !budget.enabled ||
    active.projectId !== plan.projectId ||
    active.epochId !== plan.epochId ||
    budget.projectId !== plan.projectId ||
    budget.epochId !== plan.epochId ||
    plan.rateRevision !== RATE_REVISION ||
    !REQUEST_MODELS.includes(plan.requestModel) ||
    plan.maxOutputTokens !== (plan.workload === "lesson" ? 8_000 : 16_000)
  )
    unavailable();
}
function assertSameEpoch(attempt: Attempt, budget: Budget) {
  // No current env/account checks: settlement must work after pause/deletion/config changes.
  if (
    attempt.projectId !== budget.projectId ||
    attempt.epochId !== budget.epochId
  )
    unavailable();
}
function assertSamePlan(attempt: Attempt, plan: SpendPlan) {
  for (const key of [
    "projectId",
    "epochId",
    "rateRevision",
    "workload",
    "purpose",
    "requestModel",
    "payloadHash",
    "maxOutputTokens",
  ] as const)
    if (attempt[key] !== plan[key]) unavailable();
}
function attemptRef(id: string) {
  if (!digest.safeParse(id).success) unavailable();
  return adminDb().doc(`aiSpendAttempts/${id}`);
}
function move(
  budget: Budget,
  attempt: Attempt,
  from: "held" | "uncertain",
  to: "known" | "uncertain" | null,
  value: number,
) {
  const update: Record<string, number> = {
    [from]: integer(budget[from] - attempt.bound),
  };
  if (to) update[to] = integer(budget[to] + value);
  if (attempt.purpose === "evaluation") {
    const source = from === "held" ? "evaluationHeld" : "evaluationUncertain";
    update[source] = integer(budget[source] - attempt.bound);
    if (to) {
      const destination =
        to === "known" ? "evaluationKnown" : "evaluationUncertain";
      update[destination] = integer(budget[destination] + value);
    }
  }
  return update;
}

/** Call after ALL existing domain reads/replay checks, before ANY transaction writes.
 * dispatchKey must include an opaque fresh generation attempt UUID, never teacher text.
 * No initialization fallback: missing audit/config/budget aborts the entire domain debit.
 */
export async function reserve(
  transaction: Transaction,
  plan: SpendPlan,
  dispatchKey: string,
  reservedUntil: Timestamp,
): Promise<SpendHandle> {
  if (
    !dispatchKey ||
    dispatchKey.length > 320 ||
    reservedUntil.toMillis() <= Date.now()
  )
    unavailable();
  const id = sha256(
    JSON.stringify([plan.projectId, plan.epochId, plan.workload, dispatchKey]),
  );
  const ref = attemptRef(id);
  const budgetRef = adminDb().doc(BUDGET_PATH);
  const [budgetDoc, existing] = await transaction.getAll(budgetRef, ref);
  const budget = readBudget(budgetDoc.data());
  assertPlanActive(plan, budget);
  if (existing.exists) {
    const attempt = readAttempt(existing.data());
    assertSamePlan(attempt, plan);
    // Idempotent reserve is NOT dispatch permission, even when already sent.
    if (attempt.state !== "reserved")
      throw new AiSpendError("ai-dispatch-conflict");
    return { id, plan };
  }
  if (
    integer(total(budget) + CALL_RESERVE_NANO_USD) > budget.ceiling ||
    (plan.purpose === "evaluation" &&
      integer(total(budget, true) + CALL_RESERVE_NANO_USD) >
        budget.evaluationCeiling)
  )
    throw new AiSpendError("ai-budget-exhausted");
  transaction.update(budgetRef, {
    held: integer(budget.held + CALL_RESERVE_NANO_USD),
    ...(plan.purpose === "evaluation"
      ? {
          evaluationHeld: integer(
            budget.evaluationHeld + CALL_RESERVE_NANO_USD,
          ),
        }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(ref, {
    schemaVersion: 1,
    ...plan,
    bound: CALL_RESERVE_NANO_USD,
    state: "reserved",
    reservedUntil,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id, plan };
}

/** Exactly one caller gets a successful dispatch grant. A lost commit ACK gives no grant.
 * Fence rechecks active user + pending job + attempt/artifact/version/expiry + batch claim.
 * The provider call runs AFTER this transaction resolves, never inside its callback.
 */
export async function beginDispatch(
  handle: SpendHandle,
  fence: DispatchFence,
): Promise<DispatchGrant> {
  const ref = attemptRef(handle.id);
  const budgetRef = adminDb().doc(BUDGET_PATH);
  const nonce = randomUUID();
  await adminDb().runTransaction(async (transaction) => {
    const [budgetDoc, attemptDoc] = await transaction.getAll(budgetRef, ref);
    const budget = readBudget(budgetDoc.data());
    const attempt = readAttempt(attemptDoc.data());
    assertSamePlan(attempt, handle.plan);
    assertPlanActive(handle.plan, budget);
    if (
      attempt.state !== "reserved" ||
      attempt.reservedUntil.toMillis() <= Date.now()
    )
      throw new AiSpendError("ai-dispatch-conflict");
    await fence(transaction); // read-only; no writes have happened yet
    transaction.update(ref, {
      state: "dispatching",
      dispatchNonce: nonce,
      dispatchedAt: FieldValue.serverTimestamp(),
    });
  });
  return { handle, nonce };
}

/** Intentionally accepts only the filtered receipt, never a full provider response. */
export function measuredReceipt(
  raw: {
    id?: unknown;
    _request_id?: unknown;
    model?: unknown;
    service_tier?: unknown;
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      total_tokens?: unknown;
      input_tokens_details?: { cached_tokens?: unknown };
      output_tokens_details?: { reasoning_tokens?: unknown };
    } | null;
  },
  plan: SpendPlan,
): Receipt {
  const usage = raw.usage;
  // New charge dimensions require a reviewed rate card, not silent zero pricing.
  const onlyKeys = (value: unknown, allowed: string[]) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key));
  if (
    !onlyKeys(usage, [
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "input_tokens_details",
      "output_tokens_details",
    ]) ||
    !onlyKeys(usage?.input_tokens_details, ["cached_tokens"]) ||
    !onlyKeys(usage?.output_tokens_details, ["reasoning_tokens"])
  )
    throw new AiSpendError("ai-accounting-pending");
  const input = amount.parse(usage?.input_tokens);
  const output = amount.parse(usage?.output_tokens);
  const cached = amount.parse(usage?.input_tokens_details?.cached_tokens);
  const tokens = amount.parse(usage?.total_tokens);
  const reasoning = amount.parse(
    usage?.output_tokens_details?.reasoning_tokens ?? 0,
  );
  if (
    !RETURNED_MODELS.has(String(raw.model)) ||
    raw.service_tier !== "default" ||
    input > MAX_INPUT_TOKENS ||
    output > plan.maxOutputTokens ||
    cached > input ||
    tokens !== input + output ||
    reasoning > output
  )
    throw new AiSpendError("ai-accounting-pending");
  // Exact nanoUSD/token: .40/1M => 400; .10/1M => 100; 1.60/1M => 1600.
  const cost = integer((input - cached) * 400 + cached * 100 + output * 1_600);
  if (cost > CALL_RESERVE_NANO_USD)
    throw new AiSpendError("ai-accounting-pending");
  return receiptSchema.parse({
    responseId: raw.id,
    requestId: raw._request_id ?? null,
    model: raw.model,
    serviceTier: "default",
    inputTokens: input,
    cachedInputTokens: cached,
    outputTokens: output,
    cost,
  });
}

/** Settle even if the job/account is gone or the project is paused. No artifact writes. */
export async function settle(
  grant: DispatchGrant,
  receipt: Receipt,
): Promise<void> {
  const filtered = receiptSchema.parse(receipt);
  // Recompute; a caller cannot supply a cheaper cost than its token counters.
  if (
    filtered.cachedInputTokens > filtered.inputTokens ||
    filtered.inputTokens > MAX_INPUT_TOKENS ||
    filtered.outputTokens > grant.handle.plan.maxOutputTokens ||
    filtered.cost !==
      integer(
        (filtered.inputTokens - filtered.cachedInputTokens) * 400 +
          filtered.cachedInputTokens * 100 +
          filtered.outputTokens * 1_600,
      ) ||
    filtered.cost > CALL_RESERVE_NANO_USD
  )
    throw new AiSpendError("ai-accounting-pending");
  const receiptHash = sha256(JSON.stringify(filtered));
  const ref = attemptRef(grant.handle.id);
  const budgetRef = adminDb().doc(BUDGET_PATH);
  const conflict = await adminDb().runTransaction(async (transaction) => {
    const [budgetDoc, attemptDoc] = await transaction.getAll(budgetRef, ref);
    const budget = readBudget(budgetDoc.data());
    const attempt = readAttempt(attemptDoc.data());
    assertSamePlan(attempt, grant.handle.plan);
    assertSameEpoch(attempt, budget);
    if (
      attempt.dispatchNonce !== grant.nonce ||
      (attempt.state === "settled" && attempt.receiptHash !== receiptHash) ||
      !["dispatching", "uncertain", "settled"].includes(attempt.state)
    ) {
      transaction.update(budgetRef, {
        enabled: false,
        pauseReason: "receipt-conflict",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true; // throw AFTER committing the pause
    }
    if (attempt.state === "settled") return false;
    transaction.update(budgetRef, {
      ...move(
        budget,
        attempt,
        attempt.state === "uncertain" ? "uncertain" : "held",
        "known",
        filtered.cost,
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(ref, {
      state: "settled",
      receipt: filtered,
      receiptHash,
      settledAt: FieldValue.serverTimestamp(),
    });
    return false;
  });
  if (conflict) throw new AiSpendError("ai-accounting-pending");
}

export type UncertainReason =
  | "transport"
  | "provider-limit"
  | "worker-abandoned"
  | "invalid-receipt"
  | "settlement-unavailable";
/** Never classify a dispatched HTTP error/timeout as a zero-dollar response.
 * Unknown receipts also pause the project: the approved rate assumptions need review.
 */
export async function markUncertain(
  handle: SpendHandle,
  reason: UncertainReason,
): Promise<void> {
  const ref = attemptRef(handle.id);
  const budgetRef = adminDb().doc(BUDGET_PATH);
  await adminDb().runTransaction(async (transaction) => {
    const [budgetDoc, attemptDoc] = await transaction.getAll(budgetRef, ref);
    const budget = readBudget(budgetDoc.data());
    const attempt = readAttempt(attemptDoc.data());
    assertSamePlan(attempt, handle.plan);
    assertSameEpoch(attempt, budget);
    if (reason === "invalid-receipt" || reason === "provider-limit")
      transaction.update(budgetRef, {
        enabled: false,
        pauseReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      });
    if (attempt.state !== "dispatching") return; // settled/released must never regress
    transaction.update(budgetRef, {
      ...move(budget, attempt, "held", "uncertain", attempt.bound),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(ref, {
      state: "uncertain",
      uncertainReason: reason,
      uncertainAt: FieldValue.serverTimestamp(),
    });
  });
}

/** Independent of teacher cleanup. May run after an artifact/account was deleted.
 * reserved => proven undispatched and release; dispatching => preserve full uncertainty.
 * Settlement races are safe because both operations transact the same attempt document.
 */
export async function abandon(id: string): Promise<void> {
  const ref = attemptRef(id);
  const budgetRef = adminDb().doc(BUDGET_PATH);
  await adminDb().runTransaction(async (transaction) => {
    const [budgetDoc, attemptDoc] = await transaction.getAll(budgetRef, ref);
    if (!attemptDoc.exists) return;
    const budget = readBudget(budgetDoc.data());
    const attempt = readAttempt(attemptDoc.data());
    assertSameEpoch(attempt, budget);
    if (attempt.state === "reserved") {
      transaction.update(budgetRef, {
        ...move(budget, attempt, "held", null, 0),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(ref, {
        state: "released",
        releasedAt: FieldValue.serverTimestamp(),
      });
    } else if (attempt.state === "dispatching") {
      transaction.update(budgetRef, {
        ...move(budget, attempt, "held", "uncertain", attempt.bound),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(ref, {
        state: "uncertain",
        uncertainReason: "worker-abandoned",
        uncertainAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

/** Use only after the domain job is terminal, or after reservedUntil passed.
 * Logging is categorical; never log the original provider error/response or teaching text.
 * Failure retains a safe hold. It must not override successful teacher-domain recovery.
 */
export async function abandonBestEffort(id: unknown): Promise<void> {
  if (typeof id !== "string") return;
  try {
    await abandon(id);
  } catch {
    console.error("ai-spend-cleanup-pending", { attemptId: id });
  }
}
