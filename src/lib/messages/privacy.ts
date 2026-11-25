/** Recipient preferences apply on every send, including existing conversations. */
export function canReceiveMessage({
  connected,
  allowNonConnections,
  blocked = false,
}: {
  connected: boolean;
  allowNonConnections: boolean;
  blocked?: boolean;
}) {
  return !blocked && (connected || allowNonConnections);
}
