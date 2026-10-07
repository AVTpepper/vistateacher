import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Query,
} from "firebase-admin/firestore";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";
import { getBillingProvider } from "@/lib/billing/stripe-provider";

export type DeletionStatus = "pending" | "processing" | "failed" | "complete";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function enqueueAccountDeletion(uid: string) {
  const receipt = randomUUID();
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const jobRef = db.doc(`accountDeletions/${uid}`);
    const [user, job] = await transaction.getAll(
      db.doc(`users/${uid}`),
      jobRef,
    );
    if (!user.exists || user.data()?.status !== "active")
      throw new Error("This account cannot request deletion.");
    if (job.data()?.status === "processing")
      throw new Error("Your deletion is already being processed.");
    transaction.set(
      jobRef,
      {
        receiptHash: hash(receipt),
        status: "pending",
        phase: job.data()?.phase ?? "billing",
        requestedAt: job.data()?.requestedAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        leaseUntil: null,
      },
      { merge: true },
    );
    transaction.update(db.doc(`userPrivate/${uid}`), {
      accountDeletion: { requestedAt: FieldValue.serverTimestamp() },
    });
  });
  return receipt;
}

export async function getDeletionReceipt(
  receipt: string,
): Promise<{ status: DeletionStatus; phase: string } | null> {
  if (!/^[a-f0-9-]{36}$/i.test(receipt)) return null;
  const snapshot = await adminDb()
    .collection("accountDeletions")
    .where("receiptHash", "==", hash(receipt))
    .limit(1)
    .get();
  const job = snapshot.docs[0]?.data();
  return job
    ? { status: job.status as DeletionStatus, phase: String(job.phase) }
    : null;
}

/** Each destructive step is repeatable; failed jobs remain visible to administrators. */
export async function processAccountDeletion(
  uid: string,
): Promise<DeletionStatus> {
  const db = adminDb();
  const jobRef = db.doc(`accountDeletions/${uid}`);
  const worker = randomUUID();
  const phase = await db.runTransaction(async (transaction) => {
    const job = await transaction.get(jobRef);
    if (!job.exists || job.data()?.status === "complete") return null;
    if (
      job.data()?.leaseUntil instanceof Timestamp &&
      job.data()!.leaseUntil.toMillis() > Date.now()
    )
      return null;
    transaction.update(jobRef, {
      status: "processing",
      worker,
      leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return String(job.data()?.phase ?? "billing");
  });
  if (phase === null) return (await jobRef.get()).data()?.status ?? "complete";
  const progress = async (next: string) => {
    await db.runTransaction(async (transaction) => {
      const job = await transaction.get(jobRef);
      if (job.data()?.worker !== worker)
        throw new Error("Deletion lease changed.");
      transaction.update(jobRef, {
        phase: next,
        leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  };
  const deleteQuery = async (
    query: Query,
    remove?: (ref: DocumentReference) => Promise<void>,
  ) => {
    for (;;) {
      const page = await query.limit(100).get();
      if (page.empty) break;
      for (const document of page.docs) {
        if (remove) await remove(document.ref);
        else await db.recursiveDelete(document.ref);
      }
      await progress("data");
    }
  };
  try {
    if (phase === "billing") {
      const [subscription, checkout] = await db.getAll(
        db.doc(`subscriptions/${uid}`),
        db.doc(`checkoutSessions/${uid}`),
      );
      if (
        checkout.data()?.sessionId ||
        subscription.data()?.stripeSubscriptionId
      ) {
        const provider = getBillingProvider();
        if (checkout.data()?.sessionId)
          await provider.closeCheckoutForDeletion(
            String(checkout.data()!.sessionId),
          );
        if (
          subscription.data()?.stripeSubscriptionId &&
          !["canceled", "incomplete_expired"].includes(
            subscription.data()!.status,
          )
        ) {
          await provider.updateSubscriptionCancellation({
            subscriptionId: String(subscription.data()!.stripeSubscriptionId),
            cancelAtPeriodEnd: true,
          });
          await subscription.ref.update({
            cancelAtPeriodEnd: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      // Replace public identity immediately; failed cleanup must not expose the old profile.
      await db.doc(`users/${uid}`).set({
        uid,
        status: "deleted",
        displayName: "Deleted educator",
        photoURL: null,
        role: "educator",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await progress("access");
    }
    if (phase !== "identity") {
      await adminAuth()
        .updateUser(uid, { disabled: true })
        .catch((error) => {
          if (error.code !== "auth/user-not-found") throw error;
        });
      await adminAuth()
        .revokeRefreshTokens(uid)
        .catch((error) => {
          if (error.code !== "auth/user-not-found") throw error;
        });
      await progress("data");
      // Remove relationships transactionally so surviving educators retain correct counts.
      for (const field of ["followerUid", "followingUid"]) {
        await deleteQuery(
          db.collection("follows").where(field, "==", uid),
          async (reference) => {
            await db.runTransaction(async (transaction) => {
              const follow = await transaction.get(reference);
              if (!follow.exists) return;
              const peerId =
                follow.data()?.followerUid === uid
                  ? follow.data()?.followingUid
                  : follow.data()?.followerUid;
              const peer = await transaction.get(db.doc(`users/${peerId}`));
              if (follow.data()?.status === "accepted" && peer.exists)
                transaction.update(peer.ref, {
                  connectionCount: Math.max(
                    0,
                    Number(peer.data()?.connectionCount ?? 0) - 1,
                  ),
                });
              transaction.delete(reference);
            });
          },
        );
      }
      for (const group of ["comments", "replies"]) {
        await deleteQuery(
          db.collectionGroup(group).where("authorId", "==", uid),
          async (reference) => {
            if (group === "replies")
              await deleteQuery(
                db
                  .collection("forumLikes")
                  .where("replyId", "==", reference.id),
              );
            await db.runTransaction(async (transaction) => {
              const parentRef = reference.parent.parent!;
              const [item, parent] = await transaction.getAll(
                reference,
                parentRef,
              );
              if (!item.exists) return;
              if (group === "replies") {
                const children = await transaction.get(
                  db
                    .collection(`${parentRef.path}/replies`)
                    .where("parentReplyId", "==", reference.id),
                );
                for (const child of children.docs)
                  transaction.update(child.ref, { parentReplyId: null });
              }
              if (parent.exists) {
                const counter =
                  group === "comments" ? "commentCount" : "replyCount";
                transaction.update(parentRef, {
                  [counter]: Math.max(
                    0,
                    Number(parent.data()?.[counter] ?? 0) - 1,
                  ),
                  ...(parent.data()?.acceptedReplyId === reference.id
                    ? { acceptedReplyId: null, solved: false }
                    : {}),
                });
              }
              transaction.delete(reference);
            });
          },
        );
      }
      for (const collection of [
        "postLikes",
        "postBookmarks",
        "postShares",
        "forumLikes",
        "resourceReviews",
      ]) {
        await deleteQuery(
          db
            .collection(collection)
            .where(
              collection === "resourceReviews" ? "authorId" : "uid",
              "==",
              uid,
            ),
          async (reference) => {
            await db.runTransaction(async (transaction) => {
              const reaction = await transaction.get(reference);
              if (!reaction.exists) return;
              const data = reaction.data()!;
              const targetPath =
                collection === "resourceReviews"
                  ? `resources/${data.resourceId}`
                  : collection === "forumLikes"
                    ? `forumThreads/${data.threadId}${data.replyId ? `/replies/${data.replyId}` : ""}`
                    : `posts/${data.postId}`;
              const target = await transaction.get(db.doc(targetPath));
              if (target.exists) {
                if (collection === "resourceReviews") {
                  const ratingCount = Math.max(
                    0,
                    Number(target.data()?.ratingCount ?? 0) - 1,
                  );
                  const ratingTotal = Math.max(
                    0,
                    Number(target.data()?.ratingTotal ?? 0) -
                      Number(data.rating ?? 0),
                  );
                  transaction.update(target.ref, {
                    ratingCount,
                    ratingTotal,
                    ratingAverage: ratingCount ? ratingTotal / ratingCount : 0,
                  });
                } else {
                  const counter =
                    collection === "postBookmarks"
                      ? "bookmarkCount"
                      : collection === "postShares"
                        ? "shareCount"
                        : "likeCount";
                  transaction.update(target.ref, {
                    [counter]: Math.max(
                      0,
                      Number(target.data()?.[counter] ?? 0) - 1,
                    ),
                  });
                }
              }
              transaction.delete(reference);
            });
          },
        );
      }
      for (const collection of [
        "posts",
        "resources",
        "forumThreads",
        "lessons",
      ]) {
        await deleteQuery(
          db
            .collection(collection)
            .where(
              collection === "lessons" ? "ownerId" : "authorId",
              "==",
              uid,
            ),
          async (reference) => {
            const dependents: [string, string][] =
              collection === "posts"
                ? [
                    ["postLikes", "postId"],
                    ["postBookmarks", "postId"],
                    ["postShares", "postId"],
                  ]
                : collection === "resources"
                  ? [["resourceReviews", "resourceId"]]
                  : collection === "forumThreads"
                    ? [
                        ["forumLikes", "threadId"],
                        ["forumViews", "threadId"],
                      ]
                    : [];
            for (const [name, field] of dependents)
              await deleteQuery(
                db.collection(name).where(field, "==", reference.id),
              );
            await db.recursiveDelete(reference);
          },
        );
      }
      // Shared message history remains for the other participant; this educator's messages and files are removed.
      await deleteQuery(
        db.collectionGroup("messages").where("senderId", "==", uid),
      );
      const conversations = await db
        .collection("conversations")
        .where("participantIds", "array-contains", uid)
        .get();
      for (const conversation of conversations.docs) {
        if (conversation.data().lastSenderId === uid)
          await conversation.ref.update({
            lastMessagePreview: "Message removed",
            updatedAt: FieldValue.serverTimestamp(),
          });
      }
      const attachments = await db
        .collection("messageAttachments")
        .where("ownerId", "==", uid)
        .get();
      for (const attachment of attachments.docs) {
        if (typeof attachment.data().path === "string")
          await adminStorage()
            .bucket()
            .file(attachment.data().path)
            .delete({ ignoreNotFound: true });
        await attachment.ref.delete();
      }
      for (const [collection, fields] of [
        ["blocks", ["blockerUid", "blockedUid"]],
        ["profileViews", ["profileUid", "viewerUid"]],
        ["verificationRequests", ["uid"]],
        ["forumViews", ["viewerUid"]],
      ] as const)
        for (const field of fields)
          await deleteQuery(db.collection(collection).where(field, "==", uid));
      await deleteQuery(
        db.collectionGroup("notifications").where("actorId", "==", uid),
      );
      await deleteQuery(
        db
          .collection("usage")
          .orderBy(FieldPath.documentId())
          .startAt(`${uid}_`)
          .endAt(`${uid}_\uf8ff`),
      );
      for (const prefix of [
        `users/${uid}/`,
        `posts/${uid}/`,
        `resources/${uid}/`,
        `verification/${uid}/`,
      ])
        await adminStorage().bucket().deleteFiles({ prefix });
      for (const path of [
        `users/${uid}`,
        `userPrivate/${uid}`,
        `userAnalytics/${uid}`,
        `checkoutSessions/${uid}`,
      ])
        await db.recursiveDelete(db.doc(path));
      await progress("identity");
    }
    await adminAuth()
      .deleteUser(uid)
      .catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    await jobRef.update({
      status: "complete",
      phase: "complete",
      leaseUntil: null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "complete";
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const job = await transaction.get(jobRef);
      if (job.data()?.worker === worker)
        transaction.update(jobRef, {
          status: "failed",
          leaseUntil: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
    });
    console.error("Account deletion needs retry", { uid, error });
    return "failed";
  }
}
