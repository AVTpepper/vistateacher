export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isRecentlyOnline(
  lastActiveAt: Date | null,
  now = new Date(),
): boolean {
  if (!lastActiveAt) return false;
  const age = now.getTime() - lastActiveAt.getTime();
  return age >= 0 && age <= ONLINE_WINDOW_MS;
}
