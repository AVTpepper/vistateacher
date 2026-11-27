// @vitest-environment node
/** Real server readers and metadata functions; no policy, auth, or Storage mocks. */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { generateMetadata as resourceMetadata } from "@/app/(platform)/resources/[resourceId]/page";
import { generateMetadata as postMetadata } from "@/app/(platform)/post/[postId]/page";
import { getPublicProfileResources } from "@/lib/community/profile-resources";
import { adminDb } from "@/lib/firebase/admin";
import { createMockLesson } from "@/lib/lessons/mock-provider";
import { searchCommunity } from "@/lib/search/server";
import {
  getTeachingExport,
  getTeachingExportBytes,
  publishTeachingExport,
} from "@/lib/teaching-exports/server";
import { lessonSourceSchema } from "@/schemas/lesson";

const owner = "surface-owner";
const peer = "surface-peer";
const lessonId = "habitat-lesson";
const interactiveId = `lesson_${lessonId}`;
const regularId = "habitat-download";
const stamp = Timestamp.fromMillis(Date.UTC(2026, 10, 27));
const source = lessonSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 5",
  topic: "Habitat exploration",
  durationMinutes: 50,
  teachingStyle: "balanced",
  language: "English",
  studentNeeds: "PRIVATE_SURFACE_STUDENT_CONTEXT",
  additionalInstructions: "PRIVATE_SURFACE_TEACHER_BRIEF",
});
const content = {
  ...createMockLesson(source),
  title: "Habitat interactive lesson",
};
const exportId = "e".repeat(64);
const exportBytes = Buffer.from(
  "Saved public habitat lesson document projection.",
);
const publicationId = randomUUID();
const exportMetadata = {
  title: "Habitat lesson document",
  description: "A saved public habitat lesson document.",
  type: "lesson-plan" as const,
  subject: "Science",
  gradeLevel: "Grade 5",
  tags: ["habitat"],
  accessTier: "free" as const,
};
let environment: RulesTestEnvironment | undefined;

const resourceRef = (id: string) => adminDb().doc(`resources/${id}`);
const lessonRef = () => adminDb().doc(`lessons/${lessonId}`);
const postRef = (id = "habitat-announcement") => adminDb().doc(`posts/${id}`);
const exportRef = () =>
  adminDb().doc(`users/${owner}/teachingExports/${exportId}`);
const resourceTitle = (id: string) =>
  resourceMetadata({ params: Promise.resolve({ resourceId: id }) });
const postTitle = (id = "habitat-announcement") =>
  postMetadata({ params: Promise.resolve({ postId: id }) });

async function seedResource(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  await resourceRef(id).set({
    authorId: owner,
    title: "Habitat downloadable resource",
    description: "A habitat classroom resource for young scientists.",
    subject: "Science",
    type: "worksheet",
    gradeLevel: "Grade 5",
    tags: ["habitat"],
    status: "active",
    moderationStatus: "approved",
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  });
}

async function seedInteractive() {
  await lessonRef().set({
    ownerId: owner,
    source,
    content,
    visibility: "published",
    currentVersion: 1,
    generationStatus: "idle",
    createdAt: stamp,
    updatedAt: stamp,
  });
  await seedResource(interactiveId, {
    sourceLessonId: lessonId,
    title: content.title,
    type: "lesson-plan",
  });
}

async function seedAnnouncement(
  kind = "resource-published",
  entityId = regularId,
) {
  await postRef().set({
    authorId: owner,
    type: "activity",
    activityKind: kind,
    activityEntityId: entityId,
    activityTitle: "Habitat community announcement",
    activityHref: `/resources/${entityId}`,
    content: "Habitat community announcement",
    moderationStatus: "approved",
    createdAt: stamp,
  });
}

async function expectPublicResourceIds(ids: string[]) {
  expect(
    (await getPublicProfileResources(owner)).map((item) => item.id).sort(),
  ).toEqual([...ids].sort());
  // Public discovery remains public even when its viewer owns the candidate.
  for (const viewer of [undefined, peer, owner])
    expect(
      (await searchCommunity("habitat", viewer)).resources
        .map((item) => item.id)
        .sort(),
    ).toEqual([...ids].sort());
}

async function seedCompletedExport(resourceId = regularId) {
  await lessonRef().set({
    ownerId: owner,
    source,
    content,
    visibility: "draft",
    currentVersion: 1,
    generationStatus: "idle",
    createdAt: stamp,
    updatedAt: stamp,
  });
  await exportRef().set({
    ownerId: owner,
    kind: "lesson",
    sourceId: lessonId,
    title: "Habitat lesson document",
    version: 1,
    mode: "student",
    state: "complete",
    byteLength: exportBytes.length,
    bytes: exportBytes,
    binaryHash: createHash("sha256").update(exportBytes).digest("hex"),
    sourceFingerprint: "saved-public-projection",
    uploadSessionUri: null,
    document: {
      id: "saved-google-doc",
      title: "Habitat lesson",
      url: "https://docs.google.com/document/d/saved-google-doc/edit",
    },
    destination: {
      id: "saved-drive-account",
      email: "teacher@example.com",
      name: "Teacher",
    },
    defaults: exportMetadata,
    publication: {
      publicationId,
      metadata: exportMetadata,
      resourceId,
      state: "complete",
      claim: null,
      leaseUntil: null,
    },
  });
}

beforeAll(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher"
  )
    throw new Error(
      "Surface integration requires the isolated demo Firestore emulator.",
    );
  environment = await initializeTestEnvironment({
    projectId: "demo-vista-teacher",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  const batch = adminDb().batch();
  batch.set(adminDb().doc(`users/${owner}`), {
    status: "active",
    displayName: "Surface teacher",
    resourceCount: 1,
  });
  batch.set(adminDb().doc(`users/${peer}`), {
    status: "active",
    displayName: "Surface peer",
  });
  await batch.commit();
});
afterEach(async () => {
  await environment?.clearFirestore();
});
afterAll(async () => {
  await environment?.cleanup();
});

describe("public profile, search and resource metadata policy", () => {
  it("delivers approved regular and published interactive resources as positive controls", async () => {
    await seedResource(regularId);
    await seedInteractive();
    await expectPublicResourceIds([regularId, interactiveId]);
    expect(await resourceTitle(regularId)).toEqual({
      title: "Habitat downloadable resource",
    });
    expect(await resourceTitle(interactiveId)).toEqual({
      title: content.title,
    });
    expect(JSON.stringify(await resourceTitle(interactiveId))).not.toContain(
      "PRIVATE_SURFACE_",
    );
  });

  it.each([
    "private",
    "missing",
    "malformed",
    "wrong-owner",
    "inactive-owner",
    "missing-link",
  ] as const)(
    "hides an approved interactive resource with a %s lesson from public discovery and metadata",
    async (condition) => {
      await seedInteractive();
      if (condition === "private")
        await lessonRef().update({ visibility: "draft" });
      if (condition === "missing") await lessonRef().delete();
      if (condition === "malformed")
        await lessonRef().update({
          content: { title: "SECRET_MALFORMED_LESSON" },
        });
      if (condition === "wrong-owner")
        await lessonRef().update({ ownerId: peer });
      if (condition === "inactive-owner")
        await adminDb().doc(`users/${owner}`).update({ status: "suspended" });
      if (condition === "missing-link")
        await resourceRef(interactiveId).update({
          sourceLessonId: FieldValue.delete(),
        });
      await expectPublicResourceIds([]);
      expect(await resourceTitle(interactiveId)).toEqual({
        title: "Resource",
        robots: { index: false, follow: false },
      });
      await seedAnnouncement("lesson-published", lessonId);
      expect(await postTitle()).toEqual({
        title: "Shared post",
        robots: { index: false, follow: false },
      });
    },
  );

  it.each(["rejected", "pending", "draft"] as const)(
    "hides %s regular resources and their metadata without an owner discovery bypass",
    async (condition) => {
      await seedResource(regularId, {
        title: "SECRET_HIDDEN_RESOURCE_TITLE",
        ...(condition === "draft"
          ? { status: "draft" }
          : { moderationStatus: condition }),
      });
      await expectPublicResourceIds([]);
      const metadata = await resourceTitle(regularId);
      expect(metadata).toEqual({
        title: "Resource",
        robots: { index: false, follow: false },
      });
      expect(JSON.stringify(metadata)).not.toContain("SECRET_");
    },
  );

  it("returns generic metadata for an absent resource", async () => {
    expect(await resourceTitle("missing-resource")).toEqual({
      title: "Resource",
      robots: { index: false, follow: false },
    });
  });

  it("keeps an independent published document discoverable after the private original is removed", async () => {
    await seedResource(regularId, { type: "lesson-plan" });
    await seedInteractive();
    await lessonRef().delete();
    await expectPublicResourceIds([regularId]);
    expect(await resourceTitle(regularId)).toEqual({
      title: "Habitat downloadable resource",
    });
  });
});

describe("post metadata canonical parent policy", () => {
  it("returns approved authored post content as a positive control", async () => {
    await postRef("authored").set({
      authorId: owner,
      type: "post",
      content: "  Approved habitat classroom post  ",
      moderationStatus: "approved",
    });
    expect(await postTitle("authored")).toEqual({
      title: "Approved habitat classroom post",
    });
  });

  it.each(["rejected", "pending", "missing"] as const)(
    "does not expose %s authored post content through metadata",
    async (condition) => {
      if (condition !== "missing")
        await postRef("hidden-post").set({
          authorId: owner,
          type: "post",
          content: "SECRET_HIDDEN_POST_CONTENT",
          moderationStatus: condition,
        });
      const metadata = await postTitle("hidden-post");
      expect(metadata).toEqual({
        title: "Shared post",
        robots: { index: false, follow: false },
      });
      expect(JSON.stringify(metadata)).not.toContain("SECRET_");
    },
  );

  it.each(["resource", "forumThread"] as const)(
    "hides an approved announcement's metadata when its canonical %s is rejected",
    async (kind) => {
      if (kind === "resource") {
        await seedResource(regularId);
        await seedAnnouncement();
      } else {
        await adminDb()
          .doc("forumThreads/habitat-thread")
          .set({
            authorId: owner,
            title: "Habitat discussion",
            moderationStatus: "approved",
          });
        await seedAnnouncement("forum-thread", "habitat-thread");
      }
      expect(await postTitle()).toEqual({
        title: "Habitat community announcement",
      });
      const parent =
        kind === "resource"
          ? resourceRef(regularId)
          : adminDb().doc("forumThreads/habitat-thread");
      await parent.update({ moderationStatus: "rejected" });
      await postRef().update({
        content: "SECRET_SUPPRESSED_ANNOUNCEMENT_CONTENT",
        activityTitle: "SECRET_SUPPRESSED_ACTIVITY_TITLE",
      });
      const metadata = await postTitle();
      expect(metadata).toEqual({
        title: "Shared post",
        robots: { index: false, follow: false },
      });
      expect(JSON.stringify(metadata)).not.toContain("SECRET_");
    },
  );

  it("retains an announcement's own rejection even when its canonical resource is approved", async () => {
    await seedResource(regularId);
    await seedAnnouncement();
    await postRef().update({ moderationStatus: "rejected" });
    expect(await postTitle()).toEqual({
      title: "Shared post",
      robots: { index: false, follow: false },
    });
  });
});

describe("private teaching-export publication availability and replay", () => {
  it.each(["rejected", "pending", "draft", "missing"] as const)(
    "marks a completed %s public copy unavailable and refuses publication replay",
    async (condition) => {
      await seedCompletedExport();
      if (condition !== "missing")
        await seedResource(regularId, {
          type: "lesson-plan",
          ...(condition === "draft"
            ? { status: "draft" }
            : { moderationStatus: condition }),
        });
      const before = (await exportRef().get()).data()?.publication;
      expect(
        (await getTeachingExport(owner, exportId)).publication,
      ).toMatchObject({
        resourceId: regularId,
        state: "complete",
        available: false,
      });
      for (let retry = 0; retry < 2; retry++)
        await expect(
          publishTeachingExport(owner, exportId, {
            publicationId,
            metadata: exportMetadata,
          }),
        ).rejects.toMatchObject({ code: "withdrawn" });
      expect((await exportRef().get()).data()?.publication).toEqual(before);
      expect((await getTeachingExportBytes(owner, exportId)).bytes).toEqual(
        exportBytes,
      );
      expect((await adminDb().collection("resources").get()).size).toBe(
        condition === "missing" ? 0 : 1,
      );
      expect((await adminDb().collection("usage").get()).empty).toBe(true);
      expect((await adminDb().collection("posts").get()).empty).toBe(true);
    },
  );

  it("replays an approved independent completed copy without creating another publication", async () => {
    await seedCompletedExport();
    await seedResource(regularId, { type: "lesson-plan" });
    expect(
      (await getTeachingExport(owner, exportId)).publication?.available,
    ).toBe(true);
    for (let retry = 0; retry < 2; retry++)
      expect(
        await publishTeachingExport(owner, exportId, {
          publicationId,
          metadata: exportMetadata,
        }),
      ).toEqual({ resourceId: regularId });
    expect((await adminDb().collection("resources").get()).size).toBe(1);
    expect((await adminDb().collection("usage").get()).empty).toBe(true);
    expect(
      (await adminDb().doc(`users/${owner}`).get()).data()?.resourceCount,
    ).toBe(1);
  });

  it("uses the canonical linked-lesson predicate for a completed legacy publication", async () => {
    await seedInteractive();
    await seedCompletedExport(interactiveId);
    // The private original is deliberately draft although the legacy resource remains approved/active.
    expect(
      (await getTeachingExport(owner, exportId)).publication?.available,
    ).toBe(false);
    await expect(
      publishTeachingExport(owner, exportId, {
        publicationId,
        metadata: exportMetadata,
      }),
    ).rejects.toMatchObject({ code: "withdrawn" });
    expect(
      (await resourceRef(interactiveId).get()).data()?.moderationStatus,
    ).toBe("approved");
  });
});
