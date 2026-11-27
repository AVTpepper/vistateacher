import { z } from "zod";
import {
  lessonCreateRequestSchema,
  lessonRegenerateSchema,
} from "@/schemas/lesson";
import type {
  LessonBatch,
  LessonDetail,
  LessonGenerationRequestStatus,
} from "@/lib/lessons/server";

export const lessonIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), payload: lessonCreateRequestSchema }),
  z.object({
    kind: z.literal("regenerate"),
    lessonId: z.string().regex(/^[\w-]{1,128}$/),
    payload: lessonRegenerateSchema,
  }),
]);
export type LessonIntent = z.infer<typeof lessonIntentSchema>;
export const lessonIntentRecoverySchema = z.object({
  intent: lessonIntentSchema.nullable(),
});

export class LessonGenerationError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface LessonProgress {
  status: "pending" | "complete" | "failed" | "paused";
  lessons: LessonDetail[];
  batch: LessonBatch | null;
  error?: string;
}

export function lessonFailureMessage(code: string) {
  const messages: Record<string, string> = {
    "generation-failed":
      "Generation failed. Your AI allowance was restored; you can retry the saved request.",
    expired:
      "Generation was interrupted. Your AI allowance was restored; you can retry the saved request.",
    deleted:
      "This lesson was deleted. Close this request to start a new lesson.",
    conflict:
      "A newer lesson version is saved. Review it before starting another generation.",
    "limit-reached":
      "You have used your monthly AI allowance. Completed lessons remain available to edit and export.",
    "rate-limited": "Wait a few seconds before retrying this saved request.",
    inactive: "Your account cannot generate lessons at the moment.",
    "ai-budget-exhausted":
      "AI generation is paused because the pilot budget is used. Your drafts and saved work are available to edit and export.",
    "ai-unavailable":
      "AI generation is temporarily unavailable. Your drafts and saved work are safe.",
    "ai-dispatch-conflict":
      "This generation request is no longer active. Check its saved status before retrying.",
    "ai-accounting-pending":
      "This AI request could not be completed. Check the saved request status before retrying. Your drafts and saved work are safe.",
  };
  return (
    messages[code] ??
    "This request could not be completed. Your saved lessons remain available."
  );
}

async function json<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new LessonGenerationError(
      result?.error ??
        "The request could not be checked. Your saved request is available to resume.",
      result?.code ?? (response.status === 404 ? "not-found" : undefined),
    );
  if (!result)
    throw new LessonGenerationError(
      "The response was interrupted. Check your saved request to recover the result.",
    );
  return result as T;
}

function batchProgress(batch: LessonBatch): LessonProgress {
  const platformFailure = batch.items.find(
    (item) => item.status === "failed" && item.error?.startsWith("ai-"),
  );
  return {
    status:
      batch.status === "pending"
        ? "pending"
        : platformFailure
          ? "failed"
          : batch.hasMore
            ? "paused"
            : batch.status === "complete"
              ? "complete"
              : "failed",
    lessons: batch.lessons,
    batch,
    ...(batch.items.some((item) => item.status === "failed")
      ? {
          error:
            platformFailure?.error ??
            batch.items.find((item) => item.status === "failed")?.error ??
            "generation-failed",
        }
      : {}),
  };
}

/** The same snapshot and UUID are used for submission, continuation and recovery. */
export async function submitLessonIntent(
  intent: LessonIntent,
  expectedUid: string,
  fetcher: typeof fetch = fetch,
): Promise<LessonProgress> {
  const response = await fetcher(
    intent.kind === "create"
      ? "/api/ai-lessons"
      : `/api/ai-lessons/${intent.lessonId}/regenerate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vista-Expected-Uid": expectedUid,
      },
      body: JSON.stringify(intent.payload),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (intent.kind === "create" && intent.payload.count > 1)
    return batchProgress(await json<LessonBatch>(response));
  return {
    status: "complete",
    lessons: [await json<LessonDetail>(response)],
    batch: null,
  };
}

export async function checkLessonIntent(
  intent: LessonIntent,
  expectedUid: string,
  fetcher: typeof fetch = fetch,
): Promise<LessonProgress> {
  const isBatch = intent.kind === "create" && intent.payload.count > 1;
  const response = await fetcher(
    `/api/ai-lessons/${isBatch ? "batches" : "requests"}/${intent.payload.requestId}`,
    {
      cache: "no-store",
      headers: { "X-Vista-Expected-Uid": expectedUid },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (isBatch) return batchProgress(await json<LessonBatch>(response));
  const job = await json<LessonGenerationRequestStatus>(response);
  return {
    status: job.status === "complete" && !job.lesson ? "failed" : job.status,
    lessons: job.lesson ? [job.lesson] : [],
    batch: null,
    ...(job.error ? { error: job.error } : {}),
  };
}
