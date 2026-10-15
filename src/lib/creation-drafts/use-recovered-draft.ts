"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";

// Recovery accepts incomplete fields, unlike publish-time validation.
function hasShape(value: unknown, template: unknown): boolean {
  if (template === null)
    return (
      value === null || typeof value === "object" || typeof value === "string"
    );
  if (Array.isArray(template)) {
    return (
      Array.isArray(value) &&
      (template.length === 0 ||
        value.every((item) => hasShape(item, template[0])))
    );
  }
  if (typeof template === "object") {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(template).every(([key, field]) =>
        hasShape((value as Record<string, unknown>)[key], field),
      )
    );
  }
  return typeof value === typeof template;
}

export function useRecoveredDraft<T>(
  key: string,
  initialValue: T,
  validator?: { safeParse: (value: unknown) => { success: boolean } },
) {
  const storageKey = `vista:draft:v1:${key}`;
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [restored, setRestored] = useState(false);
  const current = useRef(initialValue);
  const initial = useRef(initialValue);
  const validation = useRef(validator);
  const dirty = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const stored: unknown = JSON.parse(raw);
      if (
        !(validation.current
          ? validation.current.safeParse(stored).success
          : hasShape(stored, initial.current))
      ) {
        localStorage.removeItem(storageKey);
        return;
      }
      current.current = stored as T;
      dirty.current = true;
      // Browser-only recovery runs after hydration to keep server markup stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(stored as T);
      setRestored(true);
      setStatus("saved");
    } catch {
      // A blocked/full storage area must never prevent editing.
      setStatus("error");
    }
  }, [storageKey]);

  const update = useCallback(
    (next: SetStateAction<T>) => {
      const updated =
        typeof next === "function"
          ? (next as (previous: T) => T)(current.current)
          : next;
      current.current = updated;
      dirty.current = true;
      setValue(updated);
      try {
        // Write during the edit event, so immediate reloads also recover it.
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      dirty.current = false;
      setStatus("idle");
      setRestored(false);
    } catch {
      setStatus("error");
    }
  }, [storageKey]);

  useEffect(() => {
    if (status !== "error") return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigate = (event: MouseEvent) => {
      if (
        !dirty.current ||
        event.defaultPrevented ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest("a[href]");
      if (
        !link ||
        link.getAttribute("href")?.startsWith("#") ||
        link.getAttribute("target") === "_blank"
      )
        return;
      if (
        !window.confirm(
          "Your draft couldn't be saved on this device. Leave and discard these changes?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [status]);

  return { value, setValue: update, clear, status, restored };
}
