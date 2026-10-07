// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { createMemoryFirestore } from "../../../tests/memory-firestore";
import { updatePost } from "@/lib/feed/server";
import { updatePostSchema } from "@/schemas/feed";

const db = createMemoryFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => db }));

beforeEach(() => {
  db.documents.clear();
  db.documents.set("users/owner", { status: "active", displayName: "Owner" });
  db.documents.set("users/peer", { status: "active", displayName: "Peer" });
  db.documents.set("posts/post-one", { authorId: "owner", mentions: [] });
});

it("notifies newly mentioned educators once and removes deleted mention metadata", async () => {
  const input = updatePostSchema.parse({
    postId: "post-one",
    type: "post",
    content: "Thanks @Peer",
    mentionUids: ["peer"],
  });
  await updatePost("owner", input);
  const notification = "users/peer/notifications/mention_post_post-one_owner";
  expect(db.documents.get(notification)?.actorId).toBe("owner");
  db.documents.set(notification, { read: true });
  await updatePost("owner", input);
  expect(db.documents.get(notification)?.read).toBe(true);
  await updatePost("owner", {
    ...input,
    content: "Thanks everyone",
    mentionUids: undefined,
  });
  expect(db.documents.get("posts/post-one")?.mentions).toEqual([]);
});
