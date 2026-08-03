import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

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

  it("prevents users from changing protected profile fields", async () => {
    await seedActiveUser("owner");
    const ownerDb = testEnv.authenticatedContext("owner").firestore();

    await assertFails(
      updateDoc(doc(ownerDb, "users", "owner"), {
        role: "platform_admin",
      }),
    );
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

  it("prevents active users from choosing post counters or approval", async () => {
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
    await assertSucceeds(
      setDoc(doc(authorDb, "posts", "safe-post"), {
        authorId: "author",
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        moderationStatus: "pending",
      }),
    );
  });

  it("prevents thread authors from granting moderation fields", async () => {
    await seedActiveUser("author");
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
});
