// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { createMemoryFirestore } from "../../../tests/memory-firestore";
import {
  prepareCommunityNotifications,
  writeCommunityNotification,
} from "./delivery";

const db = createMemoryFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => db }));

beforeEach(() => {
  db.documents.clear();
  for (const uid of ["actor", "recipient"])
    db.documents.set(`users/${uid}`, { status: "active" });
});

async function deliver(ids = ["recipient"]) {
  await db.runTransaction(async (transaction) => {
    const recipients = await prepareCommunityNotifications(
      transaction as never,
      "actor",
      ids,
    );
    for (const recipientId of recipients)
      writeCommunityNotification(transaction as never, recipients, {
        recipientId,
        id: "event-one",
        type: "post-comment",
        actorId: "actor",
        actorName: "Teacher",
        entityId: "post-one",
        message: "Teacher commented on your post.",
        href: "/post/post-one",
      });
  });
}

it("deduplicates recipients and events and supplies canonical inbox fields", async () => {
  await deliver(["recipient", "recipient", "actor", "missing"]);
  await deliver();
  const notifications = [...db.documents].filter(([path]) =>
    path.includes("/notifications/"),
  );
  expect(notifications).toHaveLength(1);
  expect(notifications[0][1]).toMatchObject({
    read: false,
    archived: false,
    type: "post-comment",
  });
});

it.each([
  ["userPrivate/recipient", { notificationSettings: { inApp: false } }],
  ["userPrivate/recipient", { notificationSettings: { inApp: "false" } }],
  ["users/recipient", { status: "suspended" }],
  ["blocks/actor_recipient", {}],
  ["blocks/recipient_actor", {}],
] as const)(
  "suppresses ineligible community delivery using %s",
  async (path, value) => {
    db.documents.set(path, value);
    await deliver();
    expect(db.documents.has("users/recipient/notifications/event-one")).toBe(
      false,
    );
  },
);

it("keeps delivery in the domain transaction when the operation is rejected", async () => {
  await expect(
    db.runTransaction(async (transaction) => {
      const recipients = await prepareCommunityNotifications(
        transaction as never,
        "actor",
        ["recipient"],
      );
      writeCommunityNotification(transaction as never, recipients, {
        recipientId: "recipient",
        id: "rejected",
        type: "follow",
        actorId: "actor",
        actorName: "Teacher",
        entityId: "actor",
        message: "Request",
        href: "/network",
      });
      throw new Error("domain rejected");
    }),
  ).rejects.toThrow("domain rejected");
  expect(db.documents.has("users/recipient/notifications/rejected")).toBe(
    false,
  );
});
