"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkLessonIntent,
  submitLessonIntent,
  LessonGenerationError,
  lessonFailureMessage,
  type LessonIntent,
  type LessonProgress,
} from "./generation-client";
import {
  clearLessonRecovery,
  readLessonRecovery,
  writeLessonRecovery,
} from "./generation-recovery";
import type { LessonDetail } from "@/lib/lessons/server";

export function useLessonGeneration(
  uid: string,
  onResults: (lessons: LessonDetail[]) => void,
  onUsage: () => Promise<void>,
) {
  const [ownerUid] = useState(uid);
  const [savedIntent, setSavedIntent] = useState<LessonIntent | null>(null);
  const [restored, setRestored] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionMismatch, setSessionMismatch] = useState(false);
  const inFlight = useRef(false);
  const resultsCallback = useRef(onResults);
  const usageCallback = useRef(onUsage);
  useEffect(() => {
    resultsCallback.current = onResults;
    usageCallback.current = onUsage;
  });
  const intentRef = useRef<LessonIntent | null>(null);
  const accountChanged = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = ownerUid === uid;
    return () => {
      mounted.current = false;
    };
  }, [ownerUid, uid]);

  useEffect(() => {
    if (ownerUid !== uid) return;
    try {
      const intent = readLessonRecovery(window.sessionStorage, ownerUid);
      if (!intent) return;
      intentRef.current = intent;
      // Browser recovery is applied after hydration to preserve server markup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedIntent(intent);
      setRestored(true);
      setRecoveryStatus("saved");
    } catch {
      setRecoveryStatus("error");
    }
  }, [ownerUid, uid]);

  // Session recovery ends when this tab closes. Completed content remains saved
  // on the server; blocked browser storage must still warn before losing work.
  useEffect(() => {
    if (recoveryStatus !== "error" || !savedIntent) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [recoveryStatus, savedIntent]);

  function saveIntent(intent: LessonIntent) {
    intentRef.current = intent;
    setSavedIntent(intent);
    try {
      writeLessonRecovery(window.sessionStorage, ownerUid, intent);
      setRecoveryStatus("saved");
    } catch {
      setRecoveryStatus("error");
    }
  }

  function clearIntent(requestId: string) {
    if (intentRef.current?.payload.requestId !== requestId) return;
    intentRef.current = null;
    setSavedIntent(null);
    setRestored(false);
    try {
      clearLessonRecovery(window.sessionStorage, ownerUid, requestId);
      setRecoveryStatus("idle");
    } catch {
      setRecoveryStatus("error");
    }
  }

  function accept(next: LessonProgress, requestId: string) {
    if (!mounted.current) return;
    setProgress(next);
    setMessage(next.error ? lessonFailureMessage(next.error) : null);
    if (next.lessons.length) resultsCallback.current(next.lessons);
    if (next.status === "complete") clearIntent(requestId);
  }

  async function run(intent: LessonIntent, mode: "submit" | "check") {
    if (
      inFlight.current ||
      !mounted.current ||
      ownerUid !== uid ||
      accountChanged.current
    )
      return false;
    inFlight.current = true;
    intentRef.current = intent;
    setBusy(true);
    setMessage(null);
    try {
      let next = await (mode === "check"
        ? checkLessonIntent(intent, ownerUid)
        : submitLessonIntent(intent, ownerUid));
      accept(next, intent.payload.requestId);
      // The teacher's original Generate N action authorizes each remaining item.
      // A recovered request is checked first; continuation stays explicit.
      let remaining = 4;
      while (
        mode === "submit" &&
        next.status === "paused" &&
        remaining-- > 0 &&
        mounted.current
      ) {
        next = await submitLessonIntent(intent, ownerUid);
        accept(next, intent.payload.requestId);
      }
      return mounted.current && next.status === "complete";
    } catch (error) {
      if (!mounted.current) return false;
      setMessage(
        error instanceof Error
          ? error.message
          : "The response was interrupted. Resume the saved request to check your work.",
      );
      if (
        error instanceof LessonGenerationError &&
        error.code === "account-changed"
      ) {
        accountChanged.current = true;
        setSessionMismatch(true);
        setProgress({ status: "paused", lessons: [], batch: null });
        return false;
      }
      // An uncertain response is always reconciled against the server ledger.
      // The intent is retained even when that status check also loses its response.
      try {
        const next = await checkLessonIntent(intent, ownerUid);
        accept(next, intent.payload.requestId);
        return mounted.current && next.status === "complete";
      } catch (checkError) {
        if (!mounted.current) return false;
        if (
          checkError instanceof LessonGenerationError &&
          checkError.code === "account-changed"
        ) {
          accountChanged.current = true;
          setSessionMismatch(true);
          setMessage(checkError.message);
        }
        const knownMissing =
          checkError instanceof LessonGenerationError &&
          checkError.code === "not-found";
        const knownRejected =
          error instanceof LessonGenerationError &&
          [
            "ai-budget-exhausted",
            "ai-unavailable",
            "limit-reached",
            "rate-limited",
            "invalid-content",
            "conflict",
            "inactive",
          ].includes(error.code ?? "");
        // No durable job exists, so this recovery identity cannot ever resolve.
        // The creation/edit draft is stored independently and remains available.
        if (knownMissing && knownRejected)
          clearIntent(intent.payload.requestId);
        setProgress({
          status: knownMissing && knownRejected ? "failed" : "paused",
          lessons: [],
          batch: null,
        });
      }
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      // The mutation and its ledger check decide whether this request can be
      // resumed. Refreshing the allowance is independent and must not keep a
      // recovered request locked while another network request is slow.
      if (mounted.current && !accountChanged.current)
        void usageCallback.current().catch(() => undefined);
    }
  }

  // Reload recovery reads status only. It never creates a fresh request or debit.
  const recoveredId = useRef<string | null>(null);
  useEffect(() => {
    const intent = savedIntent;
    if (!intent || recoveredId.current === intent.payload.requestId) return;
    intentRef.current = intent;
    if (!restored) return;
    const timer = window.setTimeout(() => {
      recoveredId.current = intent.payload.requestId;
      void run(intent, "check");
    }, 0);
    return () => window.clearTimeout(timer);
    // Intent restoration is the only trigger; mutable UI callbacks are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, savedIntent]);

  useEffect(() => {
    if (busy || progress?.status !== "pending" || !savedIntent) return;
    const intent = savedIntent;
    const timer = window.setTimeout(() => {
      void run(intent, "check");
    }, 5000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, progress, savedIntent]);

  return {
    intent: ownerUid === uid ? savedIntent : null,
    progress: ownerUid === uid ? progress : null,
    busy: ownerUid === uid && busy,
    message:
      ownerUid === uid
        ? message
        : "Your account changed. Reload before continuing.",
    requiresReload: sessionMismatch || ownerUid !== uid,
    recoveryStatus,
    start: async (intent: LessonIntent) => {
      if (
        inFlight.current ||
        intentRef.current ||
        !mounted.current ||
        ownerUid !== uid ||
        accountChanged.current
      )
        return false;
      recoveredId.current = intent.payload.requestId;
      saveIntent(intent);
      return run(intent, "submit");
    },
    resume: () => {
      const intent = intentRef.current ?? savedIntent;
      return intent ? run(intent, "submit") : Promise.resolve(false);
    },
    check: () => {
      const intent = intentRef.current ?? savedIntent;
      return intent ? run(intent, "check") : Promise.resolve(false);
    },
    retry: () => {
      const previous = intentRef.current ?? savedIntent;
      if (
        !previous ||
        progress?.status !== "failed" ||
        !mounted.current ||
        ownerUid !== uid ||
        accountChanged.current
      )
        return Promise.resolve(false);
      const next = {
        ...previous,
        payload: { ...previous.payload, retryId: crypto.randomUUID() },
      } as LessonIntent;
      saveIntent(next);
      return run(next, "submit");
    },
    dismiss: () => {
      if (
        inFlight.current ||
        progress?.status !== "failed" ||
        !mounted.current ||
        ownerUid !== uid ||
        accountChanged.current
      )
        return;
      const intent = intentRef.current ?? savedIntent;
      if (intent) clearIntent(intent.payload.requestId);
      setProgress(null);
      setMessage(null);
    },
  };
}
