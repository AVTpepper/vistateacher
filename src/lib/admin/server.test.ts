// @vitest-environment node
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryFirestore } from "../../../tests/memory-firestore";
import {
  getAdminContent,
  getAdminOverview,
  getAdminReports,
  performAdminAction,
} from "@/lib/admin/server";
import type { AdminAction } from "@/schemas/admin";

const memory = createMemoryFirestore();
let nextAudit = 0;
const db = {
  ...memory,
  collection: (path: string) => {
    const query = memory.collection(path);
    const where = query.where.bind(query);
    return Object.assign(query, {
      doc: () => memory.doc(`${path}/audit-${++nextAudit}`),
      where: (field: string, operator: string, value: unknown) => {
        if (operator === "in" && Array.isArray(value)) {
          query.filters.push((_path, data) => value.includes(data[field]));
          return query;
        }
        return where(field, operator, value);
      },
      count: () => ({
        get: async () => {
          const result = await query.get();
          return { data: () => ({ count: result.docs.length }) };
        },
      }),
    });
  },
  getAll: vi.fn(memory.getAll),
  runTransaction: <T>(
    callback: (transaction: FirebaseFirestore.Transaction) => Promise<T>,
  ) =>
    memory.runTransaction(async (transaction) => {
      let wrote = false;
      const assertReadPhase = () => {
        if (wrote) throw new Error("Transaction read after write");
      };
      return callback({
        get: async (ref: Parameters<typeof transaction.get>[0]) => {
          assertReadPhase();
          return transaction.get(ref);
        },
        getAll: async (...refs: Parameters<typeof transaction.getAll>) => {
          assertReadPhase();
          return transaction.getAll(...refs);
        },
        create: (...args: Parameters<typeof transaction.set>) => {
          wrote = true;
          transaction.set(...args);
        },
        set: (...args: Parameters<typeof transaction.set>) => {
          wrote = true;
          transaction.set(...args);
        },
        update: (...args: Parameters<typeof transaction.update>) => {
          wrote = true;
          transaction.update(...args);
        },
      } as unknown as FirebaseFirestore.Transaction);
    }),
};

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => db }));

const admin = { uid: "admin", role: "platform_admin" as const };
const stamp = Timestamp.fromMillis(1000);
type ModerateAction = Extract<AdminAction, { action: "content.moderate" }>;
const decision = (
  targetType: ModerateAction["targetType"],
  targetId: string,
  status: ModerateAction["status"] = "rejected",
  parentId: string | null = null,
): ModerateAction => ({
  action: "content.moderate",
  targetType,
  targetId,
  parentId,
  status,
  reason: "Reviewed the reported classroom material.",
});
const auditEntries = () =>
  [...memory.documents].filter(([path]) => path.startsWith("auditLogs/"));

function seedActivity(kind = "resource-published", entityId = "resource-one") {
  memory.documents.set("posts/announcement", {
    type: "activity",
    activityKind: kind,
    activityEntityId: entityId,
    authorId: "owner",
    moderationStatus: "approved",
    createdAt: stamp,
  });
}

function seedReport(
  id: string,
  targetType: string,
  targetId: string,
  parentId: string | null = null,
) {
  memory.documents.set(`reports/${id}`, {
    targetType,
    targetId,
    parentId,
    reporterId: "peer",
    reason: "unsafe",
    details: "Please review this item.",
    status: "open",
    createdAt: stamp,
  });
}

beforeEach(() => {
  memory.documents.clear();
  db.getAll.mockClear();
  nextAudit = 0;
  memory.documents.set("users/owner", { resourceCount: 1 });
  memory.documents.set("resources/resource-one", {
    authorId: "owner",
    title: "Classroom resource",
    description: "Public description.",
    status: "active",
    moderationStatus: "approved",
    reportCount: 4,
    createdAt: stamp,
  });
});

describe("canonical administrator moderation", () => {
  it.each([
    [
      "resource-published",
      "resource-one",
      "resource",
      "resources/resource-one",
    ],
    [
      "lesson-published",
      "lesson-one",
      "resource",
      "resources/lesson_lesson-one",
    ],
    ["forum-thread", "thread-one", "forumThread", "forumThreads/thread-one"],
  ])(
    "moderates %s source and audits its canonical identity",
    async (kind, entity, targetType, path) => {
      seedActivity(kind, entity);
      memory.documents.set(path, {
        authorId: "owner",
        sourceLessonId: kind === "lesson-published" ? entity : null,
        status: "active",
        moderationStatus: "approved",
        reportCount: 4,
      });
      memory.documents.set("lessons/lesson-one", {
        privateBrief: "PRIVATE_TEACHER_BRIEF",
        visibility: "published",
      });
      await performAdminAction(admin, decision("post", "announcement"));
      expect(memory.documents.get(path)).toMatchObject({
        moderationStatus: "rejected",
        reportCount: 4,
      });
      expect(memory.documents.get("posts/announcement")?.moderationStatus).toBe(
        "rejected",
      );
      expect(memory.documents.get("users/owner")?.resourceCount).toBe(1);
      expect(memory.documents.get("lessons/lesson-one")?.visibility).toBe(
        "published",
      );
      expect(auditEntries()).toHaveLength(1);
      expect(auditEntries()[0][1]).toMatchObject({
        targetType,
        targetId: path.split("/").at(-1),
        sourceActivityId: "announcement",
        requestedTargetId: "announcement",
        previousState: {
          moderationStatus: "approved",
          activityModerationStatus: "approved",
        },
        newState: {
          moderationStatus: "rejected",
          activityModerationStatus: "rejected",
        },
      });
    },
  );

  it("keeps a separate activity rejection when only its resource is approved", async () => {
    seedActivity();
    memory.documents.set("posts/announcement", {
      ...memory.documents.get("posts/announcement"),
      moderationStatus: "rejected",
    });
    await performAdminAction(
      admin,
      decision("resource", "resource-one", "approved"),
    );
    expect(memory.documents.get("posts/announcement")?.moderationStatus).toBe(
      "rejected",
    );
    await performAdminAction(
      admin,
      decision("post", "announcement", "approved"),
    );
    expect(memory.documents.get("posts/announcement")?.moderationStatus).toBe(
      "approved",
    );
  });

  it("moderates an ordinary resource-sharing post independently from the linked resource", async () => {
    memory.documents.set("posts/authored-resource-post", {
      type: "resource",
      resourceId: "resource-one",
      moderationStatus: "approved",
    });
    await performAdminAction(admin, decision("post", "authored-resource-post"));
    expect(
      memory.documents.get("posts/authored-resource-post")?.moderationStatus,
    ).toBe("rejected");
    expect(
      memory.documents.get("resources/resource-one")?.moderationStatus,
    ).toBe("approved");
    expect(auditEntries()[0][1]).toMatchObject({
      targetType: "post",
      targetId: "authored-resource-post",
    });
  });

  it.each([
    "missing",
    "owner-mismatch",
    "missing-owner",
    "invalid-kind",
    "lesson-link",
  ])("fails closed on an activity with %s source identity", async (failure) => {
    seedActivity(
      failure === "lesson-link" ? "lesson-published" : "resource-published",
      failure === "lesson-link" ? "lesson-one" : "resource-one",
    );
    if (failure === "missing")
      memory.documents.delete("resources/resource-one");
    if (failure === "owner-mismatch")
      memory.documents.set("resources/resource-one", {
        authorId: "someone-else",
      });
    if (failure === "missing-owner") {
      memory.documents.set("posts/announcement", {
        ...memory.documents.get("posts/announcement"),
        authorId: undefined,
      });
      memory.documents.set("resources/resource-one", {
        moderationStatus: "approved",
      });
    }
    if (failure === "invalid-kind")
      memory.documents.set("posts/announcement", {
        ...memory.documents.get("posts/announcement"),
        activityKind: "invalid",
      });
    if (failure === "lesson-link")
      memory.documents.set("resources/lesson_lesson-one", {
        authorId: "owner",
        sourceLessonId: "other-lesson",
      });
    await expect(
      performAdminAction(admin, decision("post", "announcement")),
    ).rejects.toMatchObject({
      code: failure === "missing" ? "not-found" : "invalid-target",
    });
    expect(memory.documents.get("posts/announcement")?.moderationStatus).toBe(
      "approved",
    );
    expect(auditEntries()).toEqual([]);
  });

  it("requires the parent of a moderated forum reply to exist", async () => {
    memory.documents.set("forumThreads/removed/replies/reply-one", {
      moderationStatus: "approved",
    });
    await expect(
      performAdminAction(
        admin,
        decision("forumReply", "reply-one", "rejected", "removed"),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
    expect(auditEntries()).toEqual([]);
  });

  it("checks administrator authority before reading a target", async () => {
    await expect(
      performAdminAction(
        { uid: "teacher", role: "educator" },
        decision("resource", "resource-one"),
      ),
    ).rejects.toMatchObject({ code: "admin-required" });
    await expect(
      getAdminReports({ uid: "teacher", role: "educator" }),
    ).rejects.toMatchObject({ code: "admin-required" });
    expect(db.getAll).not.toHaveBeenCalled();
    expect(auditEntries()).toEqual([]);
  });
});

describe("administrator reported-content review", () => {
  it("counts existing open and pending reports instead of trusting historical stored totals", async () => {
    memory.documents.set("platformStats/current", { pendingReports: 999 });
    seedReport("open-report", "resource", "resource-one");
    seedReport("pending-report", "resource", "resource-one");
    memory.documents.set("reports/pending-report", {
      ...memory.documents.get("reports/pending-report"),
      status: "pending",
    });
    seedReport("resolved-report", "resource", "resource-one");
    memory.documents.set("reports/resolved-report", {
      ...memory.documents.get("reports/resolved-report"),
      status: "resolved",
    });
    expect((await getAdminOverview(admin)).totals.pendingReports).toBe(2);
  });

  it("loads an exact hidden resource preview without reading private lesson data", async () => {
    memory.documents.set("resources/old-hidden", {
      title: "Old hidden lesson",
      description: "A".repeat(2500),
      moderationStatus: "rejected",
      sourceLessonId: "private-lesson",
    });
    memory.documents.set("lessons/private-lesson", {
      source: "PRIVATE_TEACHER_BRIEF",
    });
    seedReport("old-report", "resource", "old-hidden");
    const [report] = await getAdminReports(admin);
    expect(report.target).toMatchObject({
      id: "old-hidden",
      type: "resource",
      title: "Old hidden lesson",
      moderationStatus: "rejected",
    });
    expect(report.target?.preview).toHaveLength(2000);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_TEACHER_BRIEF");
    expect(db.getAll.mock.calls.flat().map((ref) => ref.path)).toEqual([
      "resources/old-hidden",
    ]);
  });

  it("normalizes a legacy activity report to the canonical resource and retains announcement state", async () => {
    seedActivity();
    memory.documents.set("posts/announcement", {
      ...memory.documents.get("posts/announcement"),
      moderationStatus: "rejected",
    });
    seedReport("legacy-report", "post", "announcement");
    const [report] = await getAdminReports(admin);
    expect(report.target).toMatchObject({
      type: "resource",
      id: "resource-one",
      title: "Classroom resource",
      announcement: { id: "announcement", moderationStatus: "rejected" },
    });
  });

  it("keeps orphan and private-message reports reviewable without loading unrelated private data", async () => {
    seedActivity("resource-published", "deleted-resource");
    seedReport("orphan", "post", "announcement");
    seedReport("private-message", "message", "message-one", "conversation-one");
    memory.documents.set(
      "conversations/conversation-one/messages/message-one",
      { content: "PRIVATE_MESSAGE" },
    );
    const reports = await getAdminReports(admin);
    expect(reports).toHaveLength(2);
    expect(reports.every((report) => report.target === null)).toBe(true);
    expect(JSON.stringify(reports)).not.toContain("PRIVATE_MESSAGE");
    expect(
      db.getAll.mock.calls
        .flat()
        .every((ref) => !ref.path.startsWith("conversations/")),
    ).toBe(true);
  });

  it("includes a reply only while its parent exists", async () => {
    seedReport("reply-report", "forumReply", "reply-one", "thread-one");
    memory.documents.set("forumThreads/thread-one/replies/reply-one", {
      content: "Reported reply body",
      moderationStatus: "rejected",
    });
    expect((await getAdminReports(admin))[0].target).toBeNull();
    memory.documents.set("forumThreads/thread-one", { title: "Discussion" });
    expect((await getAdminReports(admin))[0].target).toMatchObject({
      type: "forumReply",
      id: "reply-one",
      parentId: "thread-one",
      preview: "Reported reply body",
    });
  });

  it("limits review projection to the selected 50 reports", async () => {
    for (let index = 0; index < 51; index++)
      seedReport(`report-${index}`, "resource", `resource-${index}`);
    const reports = await getAdminReports(admin);
    expect(reports).toHaveLength(50);
    expect(db.getAll.mock.calls.flat()).toHaveLength(50);
  });

  it("omits duplicate announcements from the content moderation table", async () => {
    seedActivity();
    memory.documents.set("posts/authored-post", {
      content: "Independent post",
      moderationStatus: "approved",
    });
    const content = await getAdminContent(admin);
    expect(content.some((item) => item.id === "announcement")).toBe(false);
    expect(content.some((item) => item.id === "authored-post")).toBe(true);
    expect(content.some((item) => item.id === "resource-one")).toBe(true);
  });
});
