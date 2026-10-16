export const BURST_WINDOW_MS = 60_000;
export const MESSAGE_BURST_LIMIT = 20;
export const CONNECTION_BURST_LIMIT = 10;

// The caller reads and writes this state in the same transaction as the action.
// These protections apply to every plan; paying never bypasses them.
export function nextBurstUsage(
  startedAt: Date | null,
  count: number,
  limit: number,
  now = new Date(),
): { startedAt: Date; count: number } | null {
  const elapsed = startedAt ? now.getTime() - startedAt.getTime() : Infinity;
  if (elapsed >= BURST_WINDOW_MS || elapsed < 0) {
    return { startedAt: now, count: 1 };
  }
  return count >= limit ? null : { startedAt: startedAt!, count: count + 1 };
}
