import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLessonGeneration } from "./use-lesson-generation";
import { readLessonRecovery, writeLessonRecovery } from "./generation-recovery";
import type { LessonIntent } from "./generation-client";

const intent: LessonIntent = {
  kind: "create",
  payload: {
    requestId: "7b850452-c06f-42b0-89aa-d773b6f8d630",
    count: 2,
    source: {
      subject: "Science",
      gradeLevel: "Grade 5",
      topic: "Private class context",
      durationMinutes: 50,
      teachingStyle: "balanced",
      objectives: "",
      standards: "",
      studentNeeds: "",
    },
  },
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("lesson generation account and recovery boundaries", () => {
  it.each(["ai-budget-exhausted", "ai-unavailable"])(
    "clears a proven unreserved recovery identity after %s while preserving the parameter draft",
    async (code) => {
      const single: LessonIntent = {
        ...intent,
        payload: { ...intent.payload, count: 1 },
      };
      sessionStorage.setItem(
        "independent-parameter-draft",
        JSON.stringify(single.payload.source),
      );
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code,
              error: "AI generation is paused. Your draft is safe.",
            }),
            { status: 503 },
          ),
        )
        .mockResolvedValue(
          new Response(JSON.stringify({ code: "not-found" }), { status: 404 }),
        );
      vi.stubGlobal("fetch", fetcher);
      const view = renderHook(() =>
        useLessonGeneration(
          "teacher-a",
          vi.fn(),
          vi.fn().mockResolvedValue(undefined),
        ),
      );
      await act(async () => {
        expect(await view.result.current.start(single)).toBe(false);
      });
      expect(view.result.current.progress?.status).toBe("failed");
      expect(view.result.current.intent).toBeNull();
      expect(readLessonRecovery(sessionStorage, "teacher-a")).toBeNull();
      expect(sessionStorage.getItem("independent-parameter-draft")).toBe(
        JSON.stringify(single.payload.source),
      );
      expect(view.result.current.message).not.toMatch(/upgrade/i);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it("unlocks a reconciled request while usage refresh is stalled and still prevents duplicate submissions", async () => {
    let resolveContinuation!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "partial",
            hasMore: true,
            lessons: [{ id: "saved-first-lesson" }],
            items: [
              { index: 0, status: "complete", lessonId: "saved-first-lesson" },
              { index: 1, status: "not-started", lessonId: null },
            ],
          }),
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveContinuation = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    const usage = vi.fn(() => new Promise<void>(() => undefined));
    const view = renderHook(() =>
      useLessonGeneration("teacher-a", vi.fn(), usage),
    );
    await act(async () => {
      expect(await view.result.current.start(intent)).toBe(false);
    });
    expect(view.result.current.progress?.status).toBe("paused");
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.intent).toEqual(intent);
    expect(usage).toHaveBeenCalledTimes(1);

    let completion!: Promise<boolean>;
    act(() => {
      completion = view.result.current.resume();
    });
    expect(view.result.current.busy).toBe(true);
    await act(async () => {
      expect(await view.result.current.resume()).toBe(false);
      expect(await view.result.current.check()).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(intent.payload);
    await act(async () => {
      resolveContinuation(
        new Response(
          JSON.stringify({
            status: "complete",
            hasMore: false,
            lessons: [
              { id: "saved-first-lesson" },
              { id: "saved-second-lesson" },
            ],
            items: [
              { index: 0, status: "complete", lessonId: "saved-first-lesson" },
              { index: 1, status: "complete", lessonId: "saved-second-lesson" },
            ],
          }),
        ),
      );
      expect(await completion).toBe(true);
    });
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.intent).toBeNull();
    expect(usage).toHaveBeenCalledTimes(2);
  });

  it("pauses a stale account without reconciling or continuing under its new session", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Your account changed. Reload before continuing.",
          code: "account-changed",
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const results = vi.fn();
    const usage = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(() =>
      useLessonGeneration("teacher-a", results, usage),
    );
    await act(async () => {
      expect(await view.result.current.start(intent)).toBe(false);
    });
    expect(view.result.current.message).toContain("Your account changed");
    expect(view.result.current.progress?.status).toBe("paused");
    expect(view.result.current.requiresReload).toBe(true);
    expect(readLessonRecovery(sessionStorage, "teacher-a")).toEqual(intent);
    await act(async () => {
      await view.result.current.resume();
      await view.result.current.check();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({
      "X-Vista-Expected-Uid": "teacher-a",
    });
    expect(results).not.toHaveBeenCalled();
    expect(usage).not.toHaveBeenCalled();
  });

  it("ignores an old account's delayed result and prevents batch continuation after a uid change", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const results = vi.fn();
    const usage = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(
      ({ uid }) => useLessonGeneration(uid, results, usage),
      { initialProps: { uid: "teacher-a" } },
    );
    let completion!: Promise<boolean>;
    act(() => {
      completion = view.result.current.start(intent);
    });
    view.rerender({ uid: "teacher-b" });
    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({
            status: "partial",
            hasMore: true,
            lessons: [{ id: "teacher-a-private-lesson" }],
            items: [
              {
                index: 0,
                status: "complete",
                lessonId: "teacher-a-private-lesson",
              },
              { index: 1, status: "not-started", lessonId: null },
            ],
          }),
        ),
      );
      expect(await completion).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).not.toHaveBeenCalled();
    expect(usage).not.toHaveBeenCalled();
    expect(view.result.current.intent).toBeNull();
    expect(view.result.current.progress).toBeNull();
    expect(view.result.current.requiresReload).toBe(true);
    expect(readLessonRecovery(sessionStorage, "teacher-a")).toEqual(intent);
    expect(readLessonRecovery(sessionStorage, "teacher-b")).toBeNull();
    await act(async () => {
      expect(await view.result.current.start(intent)).toBe(false);
    });
  });

  it("restores same-tab requests with an account-bound status check and no submission", async () => {
    writeLessonRecovery(sessionStorage, "teacher-a", intent);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "pending",
          hasMore: true,
          lessons: [],
          items: [{ index: 0, status: "pending", lessonId: null }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const usage = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(() =>
      useLessonGeneration("teacher-a", vi.fn(), usage),
    );
    await waitFor(() =>
      expect(view.result.current.progress?.status).toBe("pending"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      `/api/ai-lessons/batches/${intent.payload.requestId}`,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: { "X-Vista-Expected-Uid": "teacher-a" },
      cache: "no-store",
    });
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
});
