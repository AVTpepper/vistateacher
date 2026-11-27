import { describe, expect, it } from "vitest";
import {
  clearLessonRecovery,
  readLessonRecovery,
  writeLessonRecovery,
} from "./generation-recovery";
import type { LessonIntent } from "./generation-client";

function tabStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const first: LessonIntent = {
  kind: "regenerate",
  lessonId: "private-lesson",
  payload: {
    requestId: "7b850452-c06f-42b0-89aa-d773b6f8d630",
    expectedVersion: 2,
    feedback: "Keep my original teaching context.",
  },
};
const second: LessonIntent = {
  ...first,
  payload: {
    ...first.payload,
    requestId: "9aee822a-ce3f-4b9f-8099-a66abb1dca83",
  },
};

describe("per-tab lesson request recovery", () => {
  it("recovers an intent after reload without sharing active requests across tabs", () => {
    const tabA = tabStorage();
    const tabB = tabStorage();
    writeLessonRecovery(tabA, "teacher", first);
    writeLessonRecovery(tabB, "teacher", second);
    expect(readLessonRecovery(tabA, "teacher")).toEqual(first);
    expect(readLessonRecovery(tabB, "teacher")).toEqual(second);
    clearLessonRecovery(tabA, "teacher", first.payload.requestId);
    expect(readLessonRecovery(tabA, "teacher")).toBeNull();
    expect(readLessonRecovery(tabB, "teacher")).toEqual(second);
  });

  it("keeps another teacher's saved request private and intact", () => {
    const storage = tabStorage();
    writeLessonRecovery(storage, "teacher-a", first);
    expect(readLessonRecovery(storage, "teacher-b")).toBeNull();
    writeLessonRecovery(storage, "teacher-b", second);
    clearLessonRecovery(storage, "teacher-b", second.payload.requestId);
    expect(readLessonRecovery(storage, "teacher-a")).toEqual(first);
  });

  it("cannot erase a newer request when an earlier response completes late", () => {
    const storage = tabStorage();
    writeLessonRecovery(storage, "teacher", first);
    writeLessonRecovery(storage, "teacher", second);
    expect(
      clearLessonRecovery(storage, "teacher", first.payload.requestId),
    ).toBe(false);
    expect(readLessonRecovery(storage, "teacher")).toEqual(second);
  });

  it("discards malformed recovery before it can reach transport", () => {
    const storage = tabStorage();
    writeLessonRecovery(storage, "teacher", first);
    storage.setItem("vista:lesson-request:v2:teacher", "{interrupted-json");
    expect(readLessonRecovery(storage, "teacher")).toBeNull();
    storage.setItem(
      "vista:lesson-request:v2:teacher",
      JSON.stringify({ intent: { ...first, lessonId: "other/user/path" } }),
    );
    expect(readLessonRecovery(storage, "teacher")).toBeNull();
    expect(storage.getItem("vista:lesson-request:v2:teacher")).toBeNull();
  });

  it("reports inaccessible browser storage to the caller", () => {
    const storage = {
      ...tabStorage(),
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    };
    expect(() => writeLessonRecovery(storage, "teacher", first)).toThrow(
      "Storage unavailable",
    );
  });
});
