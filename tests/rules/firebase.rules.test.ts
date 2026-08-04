import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
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

  it("enforces the Free connection limit inside the transaction", async () => {
    await seedNetworkUser("follower", { followingCount: 5 });
    await seedNetworkUser("educator");

    await expect(followEducator("follower", "educator")).rejects.toMatchObject({
      code: "limit-reached",
    } satisfies Partial<NetworkActionError>);
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
