import {
  lessonIntentRecoverySchema,
  type LessonIntent,
} from "./generation-client";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageKey(uid: string) {
  return `vista:lesson-request:v2:${uid}`;
}

/** Use sessionStorage: reloads recover, while each browser tab owns its request. */
export function readLessonRecovery(
  storage: RecoveryStorage,
  uid: string,
): LessonIntent | null {
  const key = storageKey(uid);
  const raw = storage.getItem(key);
  if (!raw) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return null;
  }
  const parsed = lessonIntentRecoverySchema.safeParse(stored);
  if (!parsed.success) {
    storage.removeItem(key);
    return null;
  }
  return parsed.data.intent;
}

export function writeLessonRecovery(
  storage: RecoveryStorage,
  uid: string,
  intent: LessonIntent,
) {
  storage.setItem(storageKey(uid), JSON.stringify({ intent }));
}

/** A delayed completion may only remove the request that it completed. */
export function clearLessonRecovery(
  storage: RecoveryStorage,
  uid: string,
  requestId: string,
): boolean {
  const saved = readLessonRecovery(storage, uid);
  if (saved && saved.payload.requestId !== requestId) return false;
  storage.removeItem(storageKey(uid));
  return true;
}
