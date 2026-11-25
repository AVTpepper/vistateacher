// @vitest-environment node
import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFirestore } from "../../../tests/memory-firestore";
import {
  enqueueAccountDeletion,
  getDeletionReceipt,
  processAccountDeletion,
} from "@/lib/accounts/deletion";

const db = createMemoryFirestore();
const auth = {
  updateUser: vi.fn(async () => undefined),
  revokeRefreshTokens: vi.fn(async () => undefined),
  deleteUser: vi.fn(async () => undefined),
};
const bucket = {
  deleteFiles: vi.fn(async () => undefined),
  file: () => ({ delete: vi.fn(async () => undefined) }),
};
const provider = {
  updateSubscriptionCancellation: vi.fn(async () => undefined),
  closeCheckoutForDeletion: vi.fn(async () => undefined),
};
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => db,
  adminAuth: () => auth,
  adminStorage: () => ({ bucket: () => bucket }),
}));
vi.mock("@/lib/billing/stripe-provider", () => ({
  getBillingProvider: () => provider,
}));

describe("account deletion workflow", () => {
  beforeEach(() => {
    db.documents.clear();
    vi.clearAllMocks();
    db.documents.set("users/owner", { status: "active" });
    db.documents.set("userPrivate/owner", { email: "owner@example.com" });
    db.documents.set("subscriptions/owner", {
      status: "active",
      stripeSubscriptionId: "sub_one",
      stripeCustomerId: "cus_one",
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("cancels billing, revokes access, removes owned data, and returns a private completion receipt", async () => {
    db.documents.set("posts/owned", { authorId: "owner" });
    db.documents.set("worksheets/owned", { ownerId: "owner" });
    db.documents.set("worksheets/owned/versions/v1", {
      content: "Private worksheet",
    });
    db.documents.set("worksheets/peer", { ownerId: "peer" });
    db.documents.set("users/owner/teachingExports/private-doc", {
      bytes: Buffer.from("private export"),
      uploadSessionUri: "private-session",
    });
    db.documents.set("users/owner/generatedResourcePublications/receipt", {
      cleanupPending: true,
    });
    db.documents.set("posts/peer", {
      authorId: "peer",
      commentCount: 1,
      likeCount: 1,
    });
    db.documents.set("postLikes/peer_owner", { postId: "peer", uid: "owner" });
    db.documents.set("postBookmarks/owned_peer", {
      postId: "owned",
      uid: "peer",
    });
    db.documents.set("resources/peer", {
      authorId: "peer",
      ratingCount: 2,
      ratingTotal: 9,
      ratingAverage: 4.5,
    });
    db.documents.set("resourceReviews/peer_owner", {
      resourceId: "peer",
      authorId: "owner",
      rating: 4,
    });
    db.documents.set("posts/peer/comments/owned", { authorId: "owner" });
    db.documents.set("forumThreads/peer", {
      authorId: "peer",
      replyCount: 2,
      acceptedReplyId: "owned",
      solved: true,
    });
    db.documents.set("forumThreads/peer/replies/owned", { authorId: "owner" });
    db.documents.set("forumThreads/peer/replies/child", {
      authorId: "peer",
      parentReplyId: "owned",
    });
    db.documents.set("forumViews/peer_owner", {
      threadId: "peer",
      viewerUid: "owner",
    });
    db.documents.set("users/peer", { status: "active", connectionCount: 1 });
    db.documents.set("follows/connection", {
      followerUid: "owner",
      followingUid: "peer",
      status: "accepted",
    });
    db.documents.set("conversations/shared", {
      participantIds: ["owner", "peer"],
      lastSenderId: "owner",
      lastMessagePreview: "Private text",
    });
    db.documents.set("conversations/shared/messages/owned", {
      senderId: "owner",
    });
    db.documents.set("conversations/shared/messages/peer", {
      senderId: "peer",
    });
    const receipt = await enqueueAccountDeletion("owner");
    expect(await processAccountDeletion("owner")).toBe("complete");
    expect(provider.updateSubscriptionCancellation).toHaveBeenCalledWith({
      subscriptionId: "sub_one",
      cancelAtPeriodEnd: true,
    });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("owner");
    expect(auth.deleteUser).toHaveBeenCalledWith("owner");
    expect(db.documents.has("users/owner")).toBe(false);
    expect(db.documents.has("users/owner/teachingExports/private-doc")).toBe(
      false,
    );
    expect(
      db.documents.has("users/owner/generatedResourcePublications/receipt"),
    ).toBe(false);
    expect(db.documents.has("userPrivate/owner")).toBe(false);
    expect(db.documents.has("posts/owned")).toBe(false);
    expect(db.documents.has("worksheets/owned")).toBe(false);
    expect(db.documents.has("worksheets/owned/versions/v1")).toBe(false);
    expect(db.documents.has("worksheets/peer")).toBe(true);
    expect(db.documents.get("posts/peer")?.commentCount).toBe(0);
    expect(db.documents.get("forumThreads/peer")?.acceptedReplyId).toBeNull();
    expect(
      db.documents.get("forumThreads/peer/replies/child")?.parentReplyId,
    ).toBeNull();
    expect(db.documents.has("forumViews/peer_owner")).toBe(false);
    expect(db.documents.get("posts/peer")?.likeCount).toBe(0);
    expect(db.documents.has("postBookmarks/owned_peer")).toBe(false);
    expect(db.documents.get("resources/peer")?.ratingAverage).toBe(5);
    expect(db.documents.get("users/peer")?.connectionCount).toBe(0);
    expect(db.documents.has("conversations/shared/messages/peer")).toBe(true);
    expect(db.documents.has("conversations/shared/messages/owned")).toBe(false);
    expect(db.documents.get("conversations/shared")?.lastMessagePreview).toBe(
      "Message removed",
    );
    expect(await getDeletionReceipt(receipt)).toEqual({
      status: "complete",
      phase: "complete",
    });
    expect(await getDeletionReceipt("not-a-receipt")).toBeNull();
  });
  it("keeps the account available if billing cancellation fails", async () => {
    provider.updateSubscriptionCancellation.mockRejectedValueOnce(
      new Error("Stripe unavailable"),
    );
    await enqueueAccountDeletion("owner");
    expect(await processAccountDeletion("owner")).toBe("failed");
    expect(db.documents.get("users/owner")?.status).toBe("active");
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(await processAccountDeletion("owner")).toBe("complete");
  });
  it("resumes cleanup after an object-storage failure without canceling billing twice", async () => {
    bucket.deleteFiles.mockRejectedValueOnce(new Error("Storage unavailable"));
    await enqueueAccountDeletion("owner");
    expect(await processAccountDeletion("owner")).toBe("failed");
    expect(db.documents.get("users/owner")?.status).toBe("deleted");
    expect(await processAccountDeletion("owner")).toBe("complete");
    expect(provider.updateSubscriptionCancellation).toHaveBeenCalledTimes(1);
    expect(await processAccountDeletion("owner")).toBe("complete");
    expect(auth.deleteUser).toHaveBeenCalledTimes(1);
  });
  it("keeps content and private cleanup receipts until possible generated writes expire", async () => {
    const writeUntil = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    db.documents.set("resources/in-flight", { authorId: "owner" });
    db.documents.set("users/owner/generatedResourcePublications/in-flight", {
      writeUntil,
    });
    const receipt = await enqueueAccountDeletion("owner");
    expect(await processAccountDeletion("owner")).toBe("pending");
    expect(await getDeletionReceipt(receipt)).toEqual({
      status: "pending",
      phase: "data",
      retryAfter: writeUntil.toDate().toISOString(),
    });
    expect(db.documents.get("users/owner")?.status).toBe("deleted");
    expect(db.documents.has("resources/in-flight")).toBe(true);
    expect(
      db.documents.has("users/owner/generatedResourcePublications/in-flight"),
    ).toBe(true);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("owner");
    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(bucket.deleteFiles).not.toHaveBeenCalled();
    expect(db.documents.get("accountDeletions/owner")).toMatchObject({
      status: "pending",
      phase: "data",
      leaseUntil: null,
      retryAfter: writeUntil,
    });
    expect(await processAccountDeletion("owner")).toBe("pending");
    expect(provider.updateSubscriptionCancellation).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(writeUntil.toMillis() + 1);
    expect(await processAccountDeletion("owner")).toBe("complete");
    expect(db.documents.has("resources/in-flight")).toBe(false);
    expect(
      db.documents.has("users/owner/generatedResourcePublications/in-flight"),
    ).toBe(false);
    expect(auth.deleteUser).toHaveBeenCalledTimes(1);
  });
});
