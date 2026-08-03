export function createConversationId(
  firstUid: string,
  secondUid: string,
): string {
  if (!firstUid || !secondUid) {
    throw new Error("Two user IDs are required.");
  }
  if (firstUid === secondUid) {
    throw new Error("A conversation requires two different users.");
  }

  return [firstUid, secondUid].sort().join("_");
}
