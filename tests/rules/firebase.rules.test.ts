import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  followEducator,
  NetworkActionError,
  unfollowEducator,
} from "@/lib/network/server";
import {
  addPostComment,
  createPost,
  deletePost,
  FeedActionError,
  getFeedPage,
  setPostBookmarked,
  setPostLiked,
} from "@/lib/feed/server";
import {
  downloadResource,
  reserveResourceUpload,
  ResourceActionError,
  reviewResource,
} from "@/lib/resources/server";
import {
  acceptForumReply,
  addForumReply,
  createForumThread,
  ForumActionError,
  moderateForumThread,
  reportForumContent,
  setForumLiked,
} from "@/lib/forum/server";
import {
  MessageActionError,
  reportMessage,
  sendMessage,
  setUserBlocked,
  startConversation,
} from "@/lib/messages/server";
import {
  createLesson,
  duplicateLesson,
  LessonActionError,
  regenerateLesson,
  updateLesson,
} from "@/lib/lessons/server";
import { createLessonExport } from "@/lib/lessons/export";
import {
  BillingError,
  reconcileBillingEvent,
  startVistaTrial,
} from "@/lib/billing/server";
import { AdminActionError, performAdminAction } from "@/lib/admin/server";

const projectId = "demo-vista-teacher";
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile("firestore.rules", "utf8") },
    storage: { rules: await readFile("storage.rules", "utf8") },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => testEnv.cleanup());

async function seedActiveUser(uid: string, status = "active") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid), {
      uid,
      status,
      role: "educator",
    });
  });
}

async function seedSubscription(uid: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "subscriptions", uid), {
      plan: "free",
      status: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialStartedAt: null,
      trialEndsAt: null,
      trialConsumed: false,
      updatedAt: new Date("2026-08-04T00:00:00.000Z"),
    });
  });
}

async function seedNetworkUser(
  uid: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid), {
      uid,
      displayName: uid,
      gradeLevel: "Middle School",
      subjects: ["Science"],
      country: "United States",
      city: "Portland",
      school: "Vista School",
      yearsOfExperience: 5,
      bio: "",
      website: null,
      interests: [],
      photoURL: null,
      coverImageURL: null,
      role: "educator",
      isVerified: false,
      followerCount: 0,
      followingCount: 0,
      resourceCount: 0,
      postCount: 0,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    });
    await setDoc(doc(context.firestore(), "subscriptions", uid), {
      plan: "free",
      status: "free",
      trialConsumed: false,
      updatedAt: serverTimestamp(),
    });
  });
}

describe("Firestore rules", () => {
  it("allows public profile reads but protects private user data", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "userPrivate", "owner"), {
        email: "owner@example.test",
      });
    });

    await assertSucceeds(
      getDoc(
        doc(testEnv.unauthenticatedContext().firestore(), "users", "owner"),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("other").firestore(),
          "userPrivate",
          "owner",
        ),
      ),
    );
    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext("owner").firestore(),
          "userPrivate",
          "owner",
        ),
      ),
    );
  });

  it("keeps all profile mutations behind server validation", async () => {
    await seedActiveUser("owner");
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertFails(
      updateDoc(doc(ownerDb, "users", "owner"), {
        displayName: "Changed without server validation",
      }),
    );
  });

  it("keeps settings and deletion requests behind server validation", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "userPrivate", "owner"), {
        email: "owner@example.test",
        privacySettings: { shareContactInfo: false },
      });
    });
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertFails(
      updateDoc(doc(ownerDb, "userPrivate", "owner"), {
        privacySettings: { shareContactInfo: true },
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, "userPrivate", "owner"), {
        accountDeletion: { requestedAt: "untrusted" },
      }),
    );
  });

  it("keeps analytics owner-scoped and all aggregate writes server-owned", async () => {
    await seedActiveUser("analytics-owner");
    await seedActiveUser("analytics-outsider");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "userAnalytics", "analytics-owner"),
        { profileViews: 12 },
      );
      await setDoc(doc(context.firestore(), "platformStats", "current"), {
        totalUsers: 2,
      });
    });
    const ownerDb = testEnv.authenticatedContext("analytics-owner").firestore();
    const outsiderDb = testEnv
      .authenticatedContext("analytics-outsider")
      .firestore();

    await assertSucceeds(
      getDoc(doc(ownerDb, "userAnalytics", "analytics-owner")),
    );
    await assertFails(
      getDoc(doc(outsiderDb, "userAnalytics", "analytics-owner")),
    );
    await assertSucceeds(getDoc(doc(ownerDb, "platformStats", "current")));
    await assertFails(
      updateDoc(doc(ownerDb, "userAnalytics", "analytics-owner"), {
        profileViews: 99_999,
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, "platformStats", "current"), {
        totalUsers: 99_999,
      }),
    );
  });

  it("keeps onboarding profile creation server-owned", async () => {
    const newUserDb = testEnv.authenticatedContext("new-user").firestore();

    await assertFails(
      setDoc(doc(newUserDb, "users", "new-user"), {
        uid: "new-user",
        displayName: "New Educator",
        role: "educator",
        status: "active",
      }),
    );
    await assertFails(
      setDoc(doc(newUserDb, "userPrivate", "new-user"), {
        email: "new@example.test",
      }),
    );
  });

  it("keeps follow documents server-owned", async () => {
    await seedActiveUser("follower");
    await seedActiveUser("educator");
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("follower").firestore(),
          "follows",
          "follower_educator",
        ),
        { followerUid: "follower", followingUid: "educator" },
      ),
    );
  });

  it("creates deterministic conversations, quotas, unread state, and notifications", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");

    const result = await startConversation("sender", {
      recipientId: "recipient",
      content: "Would you like to compare reflection routines?",
    });
    expect(result.conversationId).toBe("recipient_sender");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [conversation, messages, usage, notifications] = await Promise.all([
        getDoc(
          doc(context.firestore(), "conversations", result.conversationId),
        ),
        getDocs(
          collection(
            context.firestore(),
            "conversations",
            result.conversationId,
            "messages",
          ),
        ),
        getDoc(
          doc(
            context.firestore(),
            "usage",
            "sender_" + new Date().toISOString().slice(0, 10),
          ),
        ),
        getDocs(
          collection(
            context.firestore(),
            "users",
            "recipient",
            "notifications",
          ),
        ),
      ]);
      expect(conversation.data()?.participantIds).toEqual([
        "recipient",
        "sender",
      ]);
      expect(conversation.data()?.unreadCounts).toMatchObject({
        sender: 0,
        recipient: 1,
      });
      expect(messages.size).toBe(1);
      expect(usage.data()?.messages).toBe(1);
      expect(notifications.size).toBe(1);
    });
  });

  it("enforces the Community daily message limit inside the transaction", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");
    const conversationId = "recipient_sender";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          "sender_" + new Date().toISOString().slice(0, 10),
        ),
        { uid: "sender", messages: 10 },
      );
      await setDoc(doc(context.firestore(), "conversations", conversationId), {
        participantIds: ["recipient", "sender"],
        unreadCounts: { recipient: 0, sender: 0 },
        lastMessageAt: serverTimestamp(),
      });
    });

    await expect(
      sendMessage("sender", {
        conversationId,
        content: "This message should exceed the daily limit.",
        attachmentId: null,
      }),
    ).rejects.toMatchObject({
      code: "limit-reached",
    } satisfies Partial<MessageActionError>);
  });

  it("enforces blocks and deterministic message reports", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");
    const created = await startConversation("sender", {
      recipientId: "recipient",
      content: "Initial message for moderation coverage.",
    });
    await reportMessage("recipient", {
      conversationId: created.conversationId,
      messageId: created.messageId,
      reason: "spam",
      details: "Repeated promotional content.",
    });
    await expect(
      reportMessage("recipient", {
        conversationId: created.conversationId,
        messageId: created.messageId,
        reason: "spam",
        details: "Repeated promotional content.",
      }),
    ).rejects.toMatchObject({
      code: "already-reported",
    } satisfies Partial<MessageActionError>);

    await setUserBlocked("recipient", {
      blockedUid: "sender",
      blocked: true,
    });
    await expect(
      sendMessage("sender", {
        conversationId: created.conversationId,
        content: "This message should be blocked.",
        attachmentId: null,
      }),
    ).rejects.toMatchObject({
      code: "blocked",
    } satisfies Partial<MessageActionError>);
  });

  it("limits conversation reads to participants and keeps writes server-owned", async () => {
    await seedNetworkUser("sender");
    await seedNetworkUser("recipient");
    await seedNetworkUser("outsider");
    const created = await startConversation("sender", {
      recipientId: "recipient",
      content: "Participant-only conversation.",
    });
    const recipientDb = testEnv.authenticatedContext("recipient").firestore();
    const outsiderDb = testEnv.authenticatedContext("outsider").firestore();
    await assertSucceeds(
      getDoc(doc(recipientDb, "conversations", created.conversationId)),
    );
    await assertFails(
      getDoc(doc(outsiderDb, "conversations", created.conversationId)),
    );
    await assertFails(
      setDoc(
        doc(
          recipientDb,
          "conversations",
          created.conversationId,
          "messages",
          "direct-write",
        ),
        { senderId: "recipient", content: "Untrusted write" },
      ),
    );
    await assertFails(
      updateDoc(
        doc(
          recipientDb,
          "users",
          "recipient",
          "notifications",
          `message_${created.messageId}`,
        ),
        { read: true },
      ),
    );
  });

  it("allows only exact reserved message attachment uploads", async () => {
    await seedNetworkUser("sender");
    const senderStorage = testEnv.authenticatedContext("sender").storage();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "messageAttachments", "attachment-one"),
        {
          ownerId: "sender",
          conversationId: "recipient_sender",
          fileType: "application/pdf",
          fileSize: 4,
          path: "messages/recipient_sender/attachment-one/attachment.pdf",
          status: "reserved",
        },
      );
    });
    await assertSucceeds(
      uploadBytes(
        ref(
          senderStorage,
          "messages/recipient_sender/attachment-one/attachment.pdf",
        ),
        new Uint8Array([1, 2, 3, 4]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(
          senderStorage,
          "messages/recipient_sender/attachment-one/wrong.pdf",
        ),
        new Uint8Array([1, 2, 3, 4]),
        { contentType: "application/pdf" },
      ),
    );
  });

  it("enforces Community and Plus AI quotas transactionally", async () => {
    process.env.AI_PROVIDER = "MOCK";
    await seedNetworkUser("free-teacher");
    const source = {
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Local food webs",
      durationMinutes: 50,
      objectives: "",
      standards: "MS-LS2-3",
      studentNeeds: "",
      teachingStyle: "inquiry" as const,
    };
    const communityLesson = await createLesson("free-teacher", source);
    await expect(createLesson("free-teacher", source)).rejects.toMatchObject({
      code: "creation-limit-reached",
    } satisfies Partial<LessonActionError>);

    for (let index = 0; index < 2; index += 1) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(
            context.firestore(),
            "usage",
            `free-teacher_${new Date().toISOString().slice(0, 7)}`,
          ),
          { lastAiLessonAt: new Date(0) },
          { merge: true },
        );
      });
      await regenerateLesson("free-teacher", communityLesson.id);
    }
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `free-teacher_${new Date().toISOString().slice(0, 7)}`,
        ),
        { lastAiLessonAt: new Date(0) },
        { merge: true },
      );
    });
    await expect(
      regenerateLesson("free-teacher", communityLesson.id),
    ).rejects.toMatchObject({
      code: "refinement-limit-reached",
    } satisfies Partial<LessonActionError>);

    await createLessonExport("free-teacher", communityLesson.id, "pdf");
    await createLessonExport("free-teacher", communityLesson.id, "docx");
    await expect(
      createLessonExport("free-teacher", communityLesson.id, "pdf"),
    ).rejects.toMatchObject({
      code: "export-limit-reached",
    } satisfies Partial<LessonActionError>);

    await seedNetworkUser("plus-teacher");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "subscriptions", "plus-teacher"), {
        plan: "plus",
        status: "active",
        trialConsumed: false,
      });
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `plus-teacher_${new Date().toISOString().slice(0, 7)}`,
        ),
        { uid: "plus-teacher", aiLessons: 50 },
      );
    });
    await expect(createLesson("plus-teacher", source)).rejects.toMatchObject({
      code: "limit-reached",
    } satisfies Partial<LessonActionError>);
  });

  it("persists lesson versions, edits, regeneration, and duplication atomically", async () => {
    process.env.AI_PROVIDER = "MOCK";
    await seedNetworkUser("lesson-owner");
    await seedNetworkUser("lesson-outsider");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "subscriptions", "lesson-owner"), {
        plan: "plus",
        status: "active",
        trialConsumed: false,
      });
    });
    const created = await createLesson("lesson-owner", {
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Local food webs",
      durationMinutes: 50,
      objectives: "",
      standards: "MS-LS2-3",
      studentNeeds: "Use sentence frames.",
      teachingStyle: "inquiry",
    });
    expect(created.currentVersion).toBe(1);
    expect(created.versions).toHaveLength(1);

    const edited = await updateLesson("lesson-owner", created.id, {
      ...created.content,
      title: "Revised local food webs",
    });
    expect(edited.currentVersion).toBe(2);
    expect(edited.versions[0]?.kind).toBe("edited");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `lesson-owner_${new Date().toISOString().slice(0, 7)}`,
        ),
        { lastAiLessonAt: new Date(0) },
        { merge: true },
      );
    });
    const regenerated = await regenerateLesson("lesson-owner", created.id);
    expect(regenerated.currentVersion).toBe(3);
    expect(regenerated.versions[0]?.kind).toBe("generated");

    const duplicate = await duplicateLesson("lesson-owner", created.id);
    expect(duplicate.content.title).toContain("(Copy)");
    expect(duplicate.versions[0]?.kind).toBe("duplicated");

    const ownerDb = testEnv.authenticatedContext("lesson-owner").firestore();
    const outsiderDb = testEnv
      .authenticatedContext("lesson-outsider")
      .firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "lessons", created.id)));
    await assertSucceeds(
      getDoc(doc(ownerDb, "lessons", created.id, "versions", "v1")),
    );
    await assertFails(getDoc(doc(outsiderDb, "lessons", created.id)));
    await assertFails(
      getDoc(doc(outsiderDb, "lessons", created.id, "versions", "v1")),
    );
    await assertFails(
      updateDoc(doc(ownerDb, "lessons", created.id), {
        currentVersion: 999,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb, "lessons", created.id, "versions", "v999"), {
        ownerId: "lesson-owner",
        version: 999,
      }),
    );
  });

  it("updates both counters transactionally when following and unfollowing", async () => {
    await seedNetworkUser("follower");
    await seedNetworkUser("educator");

    await followEducator("follower", "educator");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [follower, educator, relationship] = await Promise.all([
        getDoc(doc(context.firestore(), "users", "follower")),
        getDoc(doc(context.firestore(), "users", "educator")),
        getDoc(doc(context.firestore(), "follows", "follower_educator")),
      ]);
      expect(follower.data()?.followingCount).toBe(1);
      expect(educator.data()?.followerCount).toBe(1);
      expect(relationship.exists()).toBe(true);
    });

    await unfollowEducator("follower", "educator");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [follower, educator, relationship] = await Promise.all([
        getDoc(doc(context.firestore(), "users", "follower")),
        getDoc(doc(context.firestore(), "users", "educator")),
        getDoc(doc(context.firestore(), "follows", "follower_educator")),
      ]);
      expect(follower.data()?.followingCount).toBe(0);
      expect(educator.data()?.followerCount).toBe(0);
      expect(relationship.exists()).toBe(false);
    });
  });

  it("enforces the Community connection limit inside the transaction", async () => {
    await seedNetworkUser("follower", { followingCount: 5 });
    await seedNetworkUser("educator");

    await expect(followEducator("follower", "educator")).rejects.toMatchObject({
      code: "limit-reached",
    } satisfies Partial<NetworkActionError>);
  });

  it("starts the server-owned trial once and denies direct billing writes", async () => {
    await seedActiveUser("trial-owner");
    await seedSubscription("trial-owner");
    const now = new Date("2026-08-04T12:00:00.000Z");

    const state = await startVistaTrial("trial-owner", now);
    expect(state.effectivePlan).toBe("plus");
    expect(state.lifecycle).toBe("vista_trial");
    expect(state.trialEndsAt?.toISOString()).toBe("2026-08-18T12:00:00.000Z");
    await expect(startVistaTrial("trial-owner", now)).rejects.toMatchObject({
      code: "trial-unavailable",
    } satisfies Partial<BillingError>);

    const ownerDb = testEnv.authenticatedContext("trial-owner").firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "subscriptions", "trial-owner")));
    await assertFails(
      updateDoc(doc(ownerDb, "subscriptions", "trial-owner"), {
        plan: "plus",
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb, "billingEvents", "forged-event"), {
        uid: "trial-owner",
        applied: true,
      }),
    );
    await assertFails(getDoc(doc(ownerDb, "billingEvents", "forged-event")));
  });

  it("deduplicates Stripe events and ignores older lifecycle updates", async () => {
    await seedActiveUser("billing-owner");
    await seedSubscription("billing-owner");
    const currentEvent = {
      id: "evt-current",
      type: "subscription.updated" as const,
      uid: "billing-owner",
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      customerId: "cus_owner",
      subscriptionId: "sub_owner",
      priceId: "price_plus_monthly",
      interval: "month" as const,
      status: "active" as const,
      currentPeriodEnd: new Date("2026-09-04T12:00:00.000Z"),
      cancelAtPeriodEnd: false,
    };

    await expect(reconcileBillingEvent(currentEvent)).resolves.toBe(true);
    await expect(reconcileBillingEvent(currentEvent)).resolves.toBe(false);
    await expect(
      reconcileBillingEvent({
        ...currentEvent,
        id: "evt-stale",
        createdAt: new Date("2026-08-04T11:59:59.000Z"),
        status: "canceled",
      }),
    ).resolves.toBe(false);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [subscription, current, stale] = await Promise.all([
        getDoc(doc(context.firestore(), "subscriptions", "billing-owner")),
        getDoc(doc(context.firestore(), "billingEvents", "evt-current")),
        getDoc(doc(context.firestore(), "billingEvents", "evt-stale")),
      ]);
      expect(subscription.data()?.status).toBe("active");
      expect(current.data()?.applied).toBe(true);
      expect(stale.data()?.applied).toBe(false);
    });
  });

  it("prevents suspended users from creating posts", async () => {
    await seedActiveUser("suspended", "suspended");
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("suspended").firestore(),
          "posts",
          "post-one",
        ),
        { authorId: "suspended", moderationStatus: "approved" },
      ),
    );
  });

  it("keeps all post and interaction writes behind server validation", async () => {
    await seedActiveUser("author");
    const authorDb = testEnv.authenticatedContext("author").firestore();

    await assertFails(
      setDoc(doc(authorDb, "posts", "inflated-post"), {
        authorId: "author",
        likeCount: 10_000,
        commentCount: 0,
        shareCount: 0,
        moderationStatus: "approved",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "posts", "safe-post"), {
        authorId: "author",
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        moderationStatus: "pending",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "postLikes", "safe-post_author"), {
        postId: "safe-post",
        uid: "author",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "postBookmarks", "author_safe-post"), {
        postId: "safe-post",
        uid: "author",
      }),
    );
    await assertFails(
      setDoc(doc(authorDb, "reports", "post_safe-post_author"), {
        reporterId: "author",
        targetType: "post",
        targetId: "safe-post",
      }),
    );
  });

  it("updates feed counters transactionally and enforces post ownership", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reader");
    await expect(getFeedPage("reader", "saved")).resolves.toEqual({
      posts: [],
      nextCursor: null,
    });
    const postId = await createPost("author", {
      type: "question",
      content: "How do you structure peer feedback?",
      imageURLs: [],
      tags: ["Feedback"],
      resourceId: null,
    });

    await setPostLiked("reader", postId, true);
    await setPostBookmarked("reader", postId, true);
    await addPostComment("reader", {
      postId,
      content: "I use a two-stars-and-a-wish protocol.",
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [post, author, like, bookmark] = await Promise.all([
        getDoc(doc(context.firestore(), "posts", postId)),
        getDoc(doc(context.firestore(), "users", "author")),
        getDoc(doc(context.firestore(), "postLikes", `${postId}_reader`)),
        getDoc(doc(context.firestore(), "postBookmarks", `reader_${postId}`)),
      ]);
      expect(post.data()).toMatchObject({
        authorId: "author",
        moderationStatus: "approved",
        likeCount: 1,
        commentCount: 1,
      });
      expect(author.data()?.postCount).toBe(1);
      expect(like.exists()).toBe(true);
      expect(bookmark.exists()).toBe(true);
    });

    await expect(deletePost("reader", postId)).rejects.toMatchObject({
      code: "not-owner",
    } satisfies Partial<FeedActionError>);
    await deletePost("author", postId);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [post, author] = await Promise.all([
        getDoc(doc(context.firestore(), "posts", postId)),
        getDoc(doc(context.firestore(), "users", "author")),
      ]);
      expect(post.exists()).toBe(false);
      expect(author.data()?.postCount).toBe(0);
    });
  });

  it("reserves resource quota transactionally and keeps metadata server-owned", async () => {
    await seedNetworkUser("author");
    const input = {
      title: "Fraction comparison cards",
      description: "A classroom-ready card activity for comparing fractions.",
      type: "activity" as const,
      subject: "Mathematics",
      gradeLevel: "Grades 3-5",
      tags: ["Fractions"],
      accessTier: "free" as const,
      fileName: "fraction-cards.pdf",
      fileType: "application/pdf" as const,
      fileSize: 1024,
    };
    for (let index = 0; index < 5; index += 1)
      await reserveResourceUpload("author", {
        ...input,
        title: `${input.title} ${index}`,
      });
    await expect(reserveResourceUpload("author", input)).rejects.toMatchObject({
      code: "limit-reached",
    } satisfies Partial<ResourceActionError>);
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("author").firestore(),
          "resources",
          "unsafe",
        ),
        { authorId: "author", status: "active", moderationStatus: "approved" },
      ),
    );
  });

  it("limits Community resource downloads but exempts the owner", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("downloader");
    const filePath = "resources/author/download-test/resource.pdf";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "resources", "download-test"), {
        authorId: "author",
        status: "uploading",
        moderationStatus: "pending",
        accessTier: "free",
        filePath,
        fileName: "resource.pdf",
        fileType: "application/pdf",
        fileSize: 4,
        downloadCount: 0,
      });
      await setDoc(
        doc(
          context.firestore(),
          "usage",
          `downloader_${new Date().toISOString().slice(0, 7)}`,
        ),
        { uid: "downloader", resourceDownloads: 5 },
      );
    });
    await uploadBytes(
      ref(testEnv.authenticatedContext("author").storage(), filePath),
      new Uint8Array([1, 2, 3, 4]),
      { contentType: "application/pdf" },
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "resources", "download-test"), {
        status: "active",
        moderationStatus: "approved",
      });
    });

    await expect(
      downloadResource("downloader", "download-test"),
    ).rejects.toMatchObject({
      code: "download-limit-reached",
    } satisfies Partial<ResourceActionError>);
    await expect(
      downloadResource("author", "download-test"),
    ).resolves.toMatchObject({
      fileName: "resource.pdf",
    });
  });

  it("upserts one review per educator and maintains rating aggregates", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reviewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "resources", "resource-one"), {
        authorId: "author",
        status: "active",
        moderationStatus: "approved",
        ratingTotal: 0,
        ratingAverage: 0,
        ratingCount: 0,
      });
    });
    await reviewResource("reviewer", {
      resourceId: "resource-one",
      rating: 4,
      review: "Clear and useful.",
    });
    await reviewResource("reviewer", {
      resourceId: "resource-one",
      rating: 5,
      review: "Even better after a second look.",
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [resource, review] = await Promise.all([
        getDoc(doc(context.firestore(), "resources", "resource-one")),
        getDoc(
          doc(context.firestore(), "resourceReviews", "resource-one_reviewer"),
        ),
      ]);
      expect(resource.data()).toMatchObject({
        ratingTotal: 5,
        ratingAverage: 5,
        ratingCount: 1,
      });
      expect(review.data()?.rating).toBe(5);
    });
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("reviewer").firestore(),
          "resourceReviews",
          "resource-one_other",
        ),
        { resourceId: "resource-one", authorId: "reviewer", rating: 5 },
      ),
    );
  });

  it("keeps forum documents server-owned and updates trusted counters", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reviewer");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "forumCategories", "student-engagement"),
        {
          name: "Student Engagement",
          active: true,
          threadCount: 0,
          postCount: 0,
          order: 0,
        },
      );
    });
    const threadId = await createForumThread("author", {
      categoryId: "student-engagement",
      title: "How do you structure student-led discussion?",
      content:
        "I am looking for routines that make space for every learner to contribute.",
      tags: ["discussion"],
    });
    const replyId = await addForumReply("reviewer", {
      threadId,
      content: "Silent writing before partner talk has worked well for us.",
    });
    await setForumLiked("reviewer", threadId, null, true);
    await setForumLiked("reviewer", threadId, replyId, true);
    await acceptForumReply("author", "educator", threadId, replyId);
    await moderateForumThread("author", "educator", {
      threadId,
      action: "lock",
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [category, thread, reply] = await Promise.all([
        getDoc(
          doc(context.firestore(), "forumCategories", "student-engagement"),
        ),
        getDoc(doc(context.firestore(), "forumThreads", threadId)),
        getDoc(
          doc(
            context.firestore(),
            "forumThreads",
            threadId,
            "replies",
            replyId,
          ),
        ),
      ]);
      expect(category.data()).toMatchObject({ threadCount: 1, postCount: 2 });
      expect(thread.data()).toMatchObject({
        likeCount: 1,
        replyCount: 1,
        solved: true,
        acceptedReplyId: replyId,
        locked: true,
      });
      expect(reply.data()).toMatchObject({ likeCount: 1, accepted: true });
    });
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("author").firestore(),
          "forumThreads",
          "pinned-thread",
        ),
        {
          authorId: "author",
          pinned: true,
          locked: false,
          solved: false,
          acceptedReplyId: null,
          viewCount: 0,
          likeCount: 0,
          replyCount: 0,
          moderationStatus: "approved",
        },
      ),
    );
  });

  it("creates one deterministic forum report per educator", async () => {
    await seedNetworkUser("author");
    await seedNetworkUser("reporter");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "forumThreads", "thread-one"), {
        authorId: "author",
        moderationStatus: "approved",
        reportCount: 0,
      });
    });
    const report = {
      threadId: "thread-one",
      replyId: null,
      reason: "spam" as const,
      details: "Repeated promotional links.",
    };
    await reportForumContent("reporter", report);
    await expect(reportForumContent("reporter", report)).rejects.toMatchObject({
      code: "already-reported",
    } satisfies Partial<ForumActionError>);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const thread = await getDoc(
        doc(context.firestore(), "forumThreads", "thread-one"),
      );
      expect(thread.data()?.reportCount).toBe(1);
    });
  });

  it("requires conversation membership", async () => {
    await seedActiveUser("a");
    await seedActiveUser("c");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "conversations", "a_b"), {
        participantIds: ["a", "b"],
      });
    });

    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext("a").firestore(),
          "conversations",
          "a_b",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("c").firestore(),
          "conversations",
          "a_b",
        ),
      ),
    );
  });

  it("keeps lessons owner-only and subscriptions server-owned", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "lessons", "lesson-one"), {
        ownerId: "owner",
      });
    });

    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext("owner").firestore(),
          "lessons",
          "lesson-one",
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("other").firestore(),
          "lessons",
          "lesson-one",
        ),
      ),
    );
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext("owner").firestore(),
          "subscriptions",
          "owner",
        ),
        { plan: "plus" },
      ),
    );
  });

  it("allows only platform administrators to read audit logs", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "auditLogs", "audit-one"), {
        action: "user.suspended",
      });
    });

    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext("educator").firestore(),
          "auditLogs",
          "audit-one",
        ),
      ),
    );
    await assertSucceeds(
      getDoc(
        doc(
          testEnv
            .authenticatedContext("admin", { role: "platform_admin" })
            .firestore(),
          "auditLogs",
          "audit-one",
        ),
      ),
    );
    const adminDb = testEnv
      .authenticatedContext("admin", { role: "platform_admin" })
      .firestore();
    await assertFails(
      setDoc(doc(adminDb, "auditLogs", "forged-audit"), {
        actorId: "admin",
        action: "user.status",
      }),
    );
    await assertFails(
      updateDoc(doc(adminDb, "auditLogs", "audit-one"), {
        action: "tampered",
      }),
    );
  });

  it("rejects educators and protects administrator accounts", async () => {
    await seedNetworkUser("target-admin", { role: "platform_admin" });
    await expect(
      performAdminAction(
        { uid: "educator", role: "educator" },
        {
          action: "user.status",
          targetId: "target-admin",
          status: "suspended",
          reason: "Unauthorized attempt.",
        },
      ),
    ).rejects.toMatchObject({
      code: "admin-required",
    } satisfies Partial<AdminActionError>);
    await expect(
      performAdminAction(
        { uid: "admin", role: "platform_admin" },
        {
          action: "user.status",
          targetId: "target-admin",
          status: "suspended",
          reason: "Protected account test.",
        },
      ),
    ).rejects.toMatchObject({
      code: "protected-target",
    } satisfies Partial<AdminActionError>);
  });

  it("moderates content, reports, and verification with immutable audits", async () => {
    await seedNetworkUser("review-target", { isVerified: false });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "posts", "review-post"), {
          authorId: "review-target",
          content: "Reported post",
          moderationStatus: "approved",
          updatedAt: serverTimestamp(),
        }),
        setDoc(doc(db, "reports", "review-report"), {
          reporterId: "reporter",
          targetType: "post",
          targetId: "review-post",
          status: "open",
          createdAt: serverTimestamp(),
        }),
        setDoc(doc(db, "verificationRequests", "review-verification"), {
          uid: "review-target",
          evidencePath: "verification/review-target/evidence.pdf",
          status: "pending",
          createdAt: serverTimestamp(),
        }),
        setDoc(doc(db, "platformStats", "current"), {
          pendingReports: 1,
          pendingVerifications: 1,
        }),
      ]);
    });
    const actor = { uid: "admin", role: "platform_admin" as const };

    await performAdminAction(actor, {
      action: "content.moderate",
      targetType: "post",
      targetId: "review-post",
      parentId: null,
      status: "rejected",
      reason: "Violates the community guidelines.",
    });
    await performAdminAction(actor, {
      action: "report.resolve",
      targetId: "review-report",
      resolution: "resolved",
      reason: "Content was reviewed and removed.",
    });
    await performAdminAction(actor, {
      action: "verification.decide",
      targetId: "review-verification",
      decision: "approved",
      reason: "Professional evidence confirmed.",
    });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const [post, report, verification, user, stats, audits] =
        await Promise.all([
          getDoc(doc(db, "posts", "review-post")),
          getDoc(doc(db, "reports", "review-report")),
          getDoc(doc(db, "verificationRequests", "review-verification")),
          getDoc(doc(db, "users", "review-target")),
          getDoc(doc(db, "platformStats", "current")),
          getDocs(collection(db, "auditLogs")),
        ]);
      expect(post.data()?.moderationStatus).toBe("rejected");
      expect(report.data()?.status).toBe("resolved");
      expect(report.data()?.assignedAdminId).toBe("admin");
      expect(verification.data()?.status).toBe("approved");
      expect(user.data()?.isVerified).toBe(true);
      expect(stats.data()?.pendingReports).toBe(0);
      expect(stats.data()?.pendingVerifications).toBe(0);
      expect(audits.size).toBe(3);
      expect(
        audits.docs.every((audit) => audit.data().actorId === "admin"),
      ).toBe(true);
    });
  });
});

describe("Storage rules", () => {
  it("allows active owners to upload safe avatars", async () => {
    await seedActiveUser("owner");
    const storage = testEnv.authenticatedContext("owner").storage();

    await assertSucceeds(
      uploadBytes(
        ref(storage, "users/owner/avatar/avatar.png"),
        new Uint8Array([1]),
        {
          contentType: "image/png",
        },
      ),
    );
  });

  it("rejects another user's upload and unsafe avatar MIME types", async () => {
    await seedActiveUser("owner");
    const otherStorage = testEnv.authenticatedContext("other").storage();
    const ownerStorage = testEnv.authenticatedContext("owner").storage();

    await assertFails(
      uploadBytes(
        ref(otherStorage, "users/owner/avatar/avatar.png"),
        new Uint8Array([1]),
        { contentType: "image/png" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(ownerStorage, "users/owner/avatar/avatar.svg"),
        new Uint8Array([1]),
        { contentType: "image/svg+xml" },
      ),
    );
  });

  it("keeps profile cover writes server-owned", async () => {
    await seedActiveUser("owner");
    const ownerStorage = testEnv.authenticatedContext("owner").storage();

    await assertFails(
      uploadBytes(
        ref(ownerStorage, "users/owner/cover/cover.webp"),
        new Uint8Array([1]),
        { contentType: "image/webp" },
      ),
    );
  });

  it("limits post media writes to active owners and reads to signed-in users", async () => {
    await seedActiveUser("owner");
    const ownerStorage = testEnv.authenticatedContext("owner").storage();
    const otherStorage = testEnv.authenticatedContext("other").storage();
    const postPath = "posts/owner/post-one/classroom.webp";

    await assertSucceeds(
      uploadBytes(ref(ownerStorage, postPath), new Uint8Array([1]), {
        contentType: "image/webp",
      }),
    );
    await assertSucceeds(getBytes(ref(otherStorage, postPath)));
    await assertFails(
      uploadBytes(
        ref(otherStorage, "posts/owner/post-two/classroom.webp"),
        new Uint8Array([1]),
        { contentType: "image/webp" },
      ),
    );
    await assertFails(
      getBytes(ref(testEnv.unauthenticatedContext().storage(), postPath)),
    );
  });

  it("accepts safe owner verification evidence but denies every direct read", async () => {
    await seedActiveUser("owner");
    const ownerStorage = testEnv.authenticatedContext("owner").storage();
    const otherStorage = testEnv.authenticatedContext("other").storage();
    const adminStorage = testEnv
      .authenticatedContext("admin", { role: "platform_admin" })
      .storage();
    const evidencePath = "verification/owner/evidence.pdf";

    await assertSucceeds(
      uploadBytes(ref(ownerStorage, evidencePath), new Uint8Array([1]), {
        contentType: "application/pdf",
      }),
    );
    await assertFails(getBytes(ref(ownerStorage, evidencePath)));
    await assertFails(getBytes(ref(adminStorage, evidencePath)));
    await assertFails(
      uploadBytes(
        ref(otherStorage, "verification/owner/forged.pdf"),
        new Uint8Array([1]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(ownerStorage, "verification/owner/evidence.html"),
        new Uint8Array([1]),
        { contentType: "text/html" },
      ),
    );
  });

  it("allows only files matching a server-created resource reservation", async () => {
    await seedActiveUser("owner");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "resources", "reserved"), {
        authorId: "owner",
        status: "uploading",
        filePath: "resources/owner/reserved/resource.pdf",
        fileType: "application/pdf",
        fileSize: 3,
      });
    });
    const storage = testEnv.authenticatedContext("owner").storage();
    await assertSucceeds(
      uploadBytes(
        ref(storage, "resources/owner/reserved/resource.pdf"),
        new Uint8Array([1, 2, 3]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "resources/owner/orphan/resource.pdf"),
        new Uint8Array([1, 2, 3]),
        { contentType: "application/pdf" },
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "resources/owner/reserved/resource.pdf"),
        new Uint8Array([1, 2]),
        { contentType: "application/pdf" },
      ),
    );
  });
});
