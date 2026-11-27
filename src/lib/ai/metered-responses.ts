import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import {
  AiSpendError,
  beginDispatch,
  createSpendPlan,
  markUncertain,
  measuredReceipt,
  settle,
  type DispatchFence,
  type SpendHandle,
  type SpendPlan,
  type Workload,
} from "@/lib/ai/spend";

const MAX_SERIALIZED_BYTES = 262_144;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const PROVIDER_SPEND_LIMIT_CODES = new Set([
  "project_spend_limit_exceeded",
  "organization_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
  "credit_balance_exhausted",
]);

export interface PreparedResponse {
  readonly json: string; // transient in-memory teaching content; NEVER write to spend ledger/logs
  readonly plan: SpendPlan;
}
export interface MeteredGenerationContext {
  prepared: PreparedResponse;
  spend: SpendHandle;
  fence: DispatchFence;
}
/** Only these text fields are accepted. No tools, previous responses, files,
 * images/audio, background work, conversations, flex/priority, or alternate base URL.
 * Existing zodTextFormat(schema, name) supplies format including strict JSON schema.
 */
export function prepareResponse(
  workload: Workload,
  input: { instructions: string; input: string; format: unknown },
  purpose: "product" | "evaluation" = "product",
): PreparedResponse {
  const policy = createSpendPlan(workload, "0".repeat(64), purpose);
  const body = {
    model: policy.requestModel,
    instructions: input.instructions,
    input: input.input,
    text: { format: input.format },
    max_output_tokens: policy.maxOutputTokens,
    service_tier: "default",
    store: false,
    stream: false,
  };
  const json = JSON.stringify(body);
  if (Buffer.byteLength(json, "utf8") > MAX_SERIALIZED_BYTES)
    throw new AiSpendError("ai-unavailable"); // integration may map to existing invalid-content with useful text
  return Object.freeze({
    json,
    plan: Object.freeze({ ...policy, payloadHash: sha256(json) }),
  });
}

type Transport = {
  create(
    body: ResponseCreateParamsNonStreaming,
  ): Promise<Response & { _request_id?: string | null }>;
};
// Private factory: not exported. Tests inject fake create through the dependency factory below.
function productionTransport(projectId: string): Transport {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiSpendError("ai-unavailable");
  const client = new OpenAI({
    apiKey,
    project: projectId,
    organization: null,
    baseURL: "https://api.openai.com/v1", // ignore OPENAI_BASE_URL; approved endpoint only
    maxRetries: 0,
    timeout: 45_000,
  });
  return { create: (body) => client.responses.create(body) };
}

function verifiedBody(
  context: MeteredGenerationContext,
): ResponseCreateParamsNonStreaming {
  if (
    !context?.spend ||
    !context.prepared ||
    typeof context.fence !== "function"
  )
    throw new AiSpendError("ai-unavailable");
  const { prepared, spend } = context;
  if (
    prepared.plan.payloadHash !== sha256(prepared.json) ||
    JSON.stringify(prepared.plan) !== JSON.stringify(spend.plan)
  )
    throw new AiSpendError("ai-unavailable");
  const body = JSON.parse(prepared.json);
  const keys = Object.keys(body).sort().join(",");
  const format = body.text?.format;
  if (
    Buffer.byteLength(prepared.json, "utf8") > MAX_SERIALIZED_BYTES ||
    keys !==
      "input,instructions,max_output_tokens,model,service_tier,store,stream,text" ||
    typeof body.instructions !== "string" ||
    typeof body.input !== "string" ||
    body.model !== spend.plan.requestModel ||
    body.max_output_tokens !== spend.plan.maxOutputTokens ||
    body.service_tier !== "default" ||
    body.store !== false ||
    body.stream !== false ||
    !format ||
    format.type !== "json_schema" ||
    format.strict !== true ||
    typeof format.name !== "string" ||
    !format.schema ||
    Object.keys(body.text).join(",") !== "format"
  )
    throw new AiSpendError("ai-unavailable");
  return body;
}

/** No retries, including bookkeeping failures. Preserve the original safe hold if
 * bookkeeping is unavailable. Categorized logging must never include API error bodies.
 */
async function uncertainBestEffort(
  context: MeteredGenerationContext,
  reason: Parameters<typeof markUncertain>[1],
) {
  try {
    await markUncertain(context.spend, reason);
  } catch {
    console.error("ai-spend-accounting-pending", {
      attemptId: context.spend.id,
    });
  }
}

interface Dependencies {
  transport(projectId: string): Transport;
  begin: typeof beginDispatch;
  receipt: typeof measuredReceipt;
  settle: typeof settle;
  uncertain: typeof uncertainBestEffort;
}
/** Factory exists for deterministic, unpaid tests. Keep it internal/test-only when
 * copying to source (or test via module mocks); production exports only the final function.
 */
function createMeteredResponses(dependencies: Dependencies) {
  return async function request(
    context: MeteredGenerationContext,
  ): Promise<Response> {
    const body = verifiedBody(context);
    // Construct the non-network client BEFORE dispatch. A local construction error is unspent.
    const transport = dependencies.transport(context.spend.plan.projectId);
    const grant = await dependencies.begin(context.spend, context.fence);
    let response: Awaited<ReturnType<Transport["create"]>>;
    try {
      // THE ONE physical paid call. Never place a retry/repair loop around this operation.
      response = await transport.create(body);
    } catch (error) {
      // Includes APIError/429/timeout/JSON-body failure: none proves $0 spend.
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      await dependencies.uncertain(
        context,
        typeof code === "string" && PROVIDER_SPEND_LIMIT_CODES.has(code)
          ? "provider-limit"
          : "transport",
      );
      throw new AiSpendError("ai-accounting-pending");
    }
    let receipt: ReturnType<typeof measuredReceipt>;
    try {
      receipt = dependencies.receipt(response, context.spend.plan);
    } catch {
      await dependencies.uncertain(context, "invalid-receipt");
      throw new AiSpendError("ai-accounting-pending");
    }
    try {
      await dependencies.settle(grant, receipt);
    } catch {
      // Lost commit ACK may mean already settled. markUncertain never regresses settled.
      await dependencies.uncertain(context, "settlement-unavailable");
      throw new AiSpendError("ai-accounting-pending");
    }
    return response; // billing durable BEFORE any structured-output parsing/validation
  };
}
export const meteredResponse = createMeteredResponses({
  transport: productionTransport,
  begin: beginDispatch,
  receipt: measuredReceipt,
  settle,
  uncertain: uncertainBestEffort,
});

/** Deliberately downstream of settlement. Refusal, truncation, incomplete output,
 * invalid JSON, Zod failure and pedagogical validation all end this paid attempt.
 * Domain code decides whether to restore the teacher action under existing rules.
 */
export function structuredJson(response: Response): unknown {
  if (
    response.status !== "completed" ||
    response.error ||
    response.incomplete_details
  )
    throw new Error("incomplete-structured-output");
  const texts: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message") throw new Error("unexpected-response-output");
    for (const content of item.content) {
      if (content.type === "refusal")
        throw new Error("refused-structured-output");
      if (content.type !== "output_text")
        throw new Error("unexpected-response-content");
      texts.push(content.text);
    }
  }
  if (texts.length !== 1 || !texts[0])
    throw new Error("empty-structured-output");
  return JSON.parse(texts[0]);
}
