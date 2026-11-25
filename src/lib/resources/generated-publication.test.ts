// @vitest-environment node
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryFirestore } from "../../../tests/memory-firestore";
import {
  enqueueAccountDeletion,
  processAccountDeletion,
} from "@/lib/accounts/deletion";
import {
  cancelResourceUpload,
  drainGeneratedResourceCleanup,
  finalizeResourceUpload,
  reserveGeneratedResource,
  reserveResourceUpload,
  saveGeneratedResourceBytes,
} from "./server";

const memory = createMemoryFirestore();
const db = {
  ...memory,
  runTransaction: (
    callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>,
  ) =>
    memory.runTransaction(async (transaction) => {
      let wrote = false;
      const beforeRead = () => {
        if (wrote) throw new Error("transaction read after write");
      };
      return callback({
        get: async (ref: Parameters<typeof transaction.get>[0]) => {
          beforeRead();
          return transaction.get(ref);
        },
        getAll: async (...refs: Parameters<typeof transaction.getAll>) => {
          beforeRead();
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
        delete: (...args: Parameters<typeof transaction.delete>) => {
          wrote = true;
          transaction.delete(...args);
        },
      } as unknown as FirebaseFirestore.Transaction);
    }),
};

const files = new Map<string, { bytes: Buffer; contentType: string }>();
const save = vi.fn(async (path: string, bytes: Buffer, contentType: string) => {
  files.set(path, { bytes: Buffer.from(bytes), contentType });
});
const remove = vi.fn(async (path: string) => {
  files.delete(path);
});
const bucket = {
  deleteFiles: vi.fn(async ({ prefix }: { prefix: string }) => {
    for (const path of files.keys())
      if (path.startsWith(prefix)) files.delete(path);
  }),
  file: (path: string) => ({
    save: (bytes: Buffer, options: { contentType: string }) =>
      save(path, bytes, options.contentType),
    getMetadata: async () => {
      const file = files.get(path);
      if (!file) throw new Error("missing upload");
      return [
        { size: String(file.bytes.length), contentType: file.contentType },
      ];
    },
    download: async () => {
      const file = files.get(path);
      if (!file) throw new Error("missing upload");
      return [file.bytes];
    },
    delete: () => remove(path),
  }),
};
const auth = {
  updateUser: vi.fn(async () => undefined),
  revokeRefreshTokens: vi.fn(async () => undefined),
  deleteUser: vi.fn(async () => undefined),
};

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => db,
  adminAuth: () => auth,
  adminStorage: () => ({ bucket: () => bucket }),
}));
vi.mock("@/lib/feed/server", () => ({
  writePublicActivity: (
    tx: FirebaseFirestore.Transaction,
    input: { entityId: string },
  ) => {
    tx.set(
      db.doc(`posts/activity_resource-published_${input.entityId}`) as never,
      input,
    );
  },
}));

const bytes = Buffer.from("immutable saved DOCX content");
const input = {
  publicationId: "publication-one",
  metadata: {
    title: "Water cycle worksheet",
    description: "A saved worksheet copy for the classroom.",
    type: "worksheet" as const,
    subject: "Science",
    gradeLevel: "Grade 5",
    tags: ["Science", "SCIENCE"],
    accessTier: "free" as const,
  },
  bytesHash: createHash("sha256").update(bytes).digest("hex"),
  byteLength: bytes.length,
};

beforeEach(() => {
  memory.documents.clear();
  files.clear();
  vi.clearAllMocks();
  memory.documents.set("users/teacher", { status: "active" });
  memory.documents.set("users/peer", { status: "active" });
});

afterEach(() => vi.restoreAllMocks());

it("concurrent retries reserve a single copy and charge one upload", async () => {
  const results = await Promise.all([
    reserveGeneratedResource("teacher", input),
    reserveGeneratedResource("teacher", input),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].state).toBe("uploading");
  const usage = [...memory.documents].filter(([path]) =>
    path.startsWith("usage/"),
  );
  expect(usage).toHaveLength(1);
  expect(usage[0][1].resourceUploads).toBe(1);
  const resource = memory.documents.get(`resources/${results[0].resourceId}`)!;
  expect(resource).toMatchObject({
    tags: ["science"],
    generatedBytesHash: input.bytesHash,
    accessTier: "free",
    fileType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  expect(resource).not.toHaveProperty("googleDocId");
});

it("rejects altered content or metadata for an existing publication intent", async () => {
  await reserveGeneratedResource("teacher", input);
  await expect(
    reserveGeneratedResource("teacher", {
      ...input,
      metadata: { ...input.metadata, title: "Different content" },
    }),
  ).rejects.toThrow("invalid-upload");
  await expect(
    reserveGeneratedResource("teacher", {
      ...input,
      bytesHash: "0".repeat(64),
    }),
  ).rejects.toThrow("invalid-upload");
});

it("reserves and links the private export atomically, so deletion cannot miss the pending copy", async () => {
  const exportPath = "users/teacher/teachingExports/atomic-export";
  memory.documents.set(exportPath, { claim: "worker-one", resourceId: null });
  const reservation = await reserveGeneratedResource("teacher", input, {
    beforeCommit: async (tx) => {
      const job = await tx.get(
        db.doc(exportPath) as unknown as FirebaseFirestore.DocumentReference,
      );
      expect(job.data()?.claim).toBe("worker-one");
    },
    onCommit: (tx, resourceId) => {
      tx.update(db.doc(exportPath) as never, { resourceId });
    },
  });
  expect(memory.documents.get(exportPath)?.resourceId).toBe(
    reservation.resourceId,
  );
  await expect(
    reserveGeneratedResource(
      "teacher",
      { ...input, publicationId: "stale-export" },
      {
        beforeCommit: async () => {
          throw new Error("source deleted");
        },
      },
    ),
  ).rejects.toThrow("source deleted");
  expect(
    [...memory.documents.keys()].filter((path) =>
      path.startsWith("resources/"),
    ),
  ).toHaveLength(1);
  const usage = [...memory.documents].find(([path]) =>
    path.startsWith("usage/"),
  );
  expect(usage?.[1].resourceUploads).toBe(1);
});

it("separates publication identities by owner and rejects inactive owners", async () => {
  const owner = await reserveGeneratedResource("teacher", input);
  const peer = await reserveGeneratedResource("peer", input);
  expect(peer.resourceId).not.toBe(owner.resourceId);
  await expect(
    saveGeneratedResourceBytes("peer", owner.resourceId, bytes),
  ).rejects.toThrow("not-owner");
  memory.documents.set("users/teacher", { status: "suspended" });
  await expect(reserveGeneratedResource("teacher", input)).rejects.toThrow(
    "inactive",
  );
  await expect(
    saveGeneratedResourceBytes("teacher", owner.resourceId, bytes),
  ).rejects.toThrow("inactive");
});

it("never recreates a cancelled or removed community copy on retry", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await cancelResourceUpload("teacher", reservation.resourceId);
  await expect(reserveGeneratedResource("teacher", input)).rejects.toThrow(
    "not-ready",
  );
  expect(memory.documents.has(`resources/${reservation.resourceId}`)).toBe(
    false,
  );
  expect(
    [...memory.documents.keys()].some((path) =>
      path.includes("generatedResourcePublications"),
    ),
  ).toBe(true);
});

it("keeps a durable cleanup receipt through failed deletion and idempotent retries", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  remove.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
  await cancelResourceUpload("teacher", reservation.resourceId);
  const receipt = [...memory.documents].find(([path]) =>
    path.includes("generatedResourcePublications"),
  )!;
  expect(memory.documents.has(`resources/${reservation.resourceId}`)).toBe(
    false,
  );
  expect(receipt[1].cleanupPending).toBe(true);
  expect(files.has(reservation.uploadPath)).toBe(true);
  expect(await drainGeneratedResourceCleanup("peer")).toBe(0);
  expect(files.has(reservation.uploadPath)).toBe(true);
  await cancelResourceUpload("teacher", reservation.resourceId);
  expect(files.has(reservation.uploadPath)).toBe(false);
  expect(memory.documents.get(receipt[0])?.cleanupPending).toBe(false);
  const usage = [...memory.documents].find(([path]) =>
    path.startsWith("usage/"),
  );
  expect(usage?.[1].resourceUploads).toBe(0);
  expect(await drainGeneratedResourceCleanup("teacher")).toBe(0);
});

it("preserves another concurrent writer's lease when a confirmed upload completes", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  let started = 0;
  let bothStarted!: () => void;
  const ready = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  const hold = (release: (resume: () => void) => void) =>
    new Promise<void>((resolve) => {
      release(resolve);
    });
  const first = hold((resolve) => {
    releaseFirst = resolve;
  });
  const second = hold((resolve) => {
    releaseSecond = resolve;
  });
  save.mockImplementationOnce(async () => {
    if (++started === 2) bothStarted();
    await first;
  });
  save.mockImplementationOnce(async () => {
    if (++started === 2) bothStarted();
    await second;
  });
  const writes = [
    saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes),
    saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes),
  ];
  await ready;
  releaseSecond();
  await writes[1];
  const receipt = [...memory.documents].find(([path]) =>
    path.includes("generatedResourcePublications"),
  )!;
  expect(Object.keys(receipt[1].writeClaims as object)).toHaveLength(1);
  expect((receipt[1].writeUntil as Timestamp).toMillis()).toBeGreaterThan(
    Date.now(),
  );
  releaseFirst();
  await writes[0];
  expect(
    Object.keys(memory.documents.get(receipt[0])!.writeClaims as object),
  ).toHaveLength(0);
  expect(
    (memory.documents.get(receipt[0])!.writeUntil as Timestamp).toMillis(),
  ).toBe(0);
});

it("defers account prefix cleanup until an in-flight upload finishes, then removes bytes and private receipts", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  memory.documents.set("userPrivate/teacher", { email: "teacher@example.com" });
  let resume!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  save.mockImplementationOnce(async (path, storedBytes, contentType) => {
    started();
    await paused;
    files.set(path, { bytes: storedBytes, contentType });
  });
  const upload = saveGeneratedResourceBytes(
    "teacher",
    reservation.resourceId,
    bytes,
  );
  await ready;
  await enqueueAccountDeletion("teacher");
  expect(await processAccountDeletion("teacher")).toBe("pending");
  expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("teacher");
  expect(bucket.deleteFiles).not.toHaveBeenCalled();
  const receipt = [...memory.documents].find(([path]) =>
    path.includes("generatedResourcePublications"),
  )!;
  expect(memory.documents.has(receipt[0])).toBe(true);
  expect(memory.documents.get("users/teacher")?.status).toBe("deleted");
  await expect(
    saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes),
  ).rejects.toThrow("inactive");
  resume();
  await upload;
  expect(files.has(reservation.uploadPath)).toBe(true);
  expect(
    (memory.documents.get(receipt[0])!.writeUntil as Timestamp).toMillis(),
  ).toBe(0);
  vi.spyOn(Date, "now").mockReturnValue(
    (
      memory.documents.get("accountDeletions/teacher")!.retryAfter as Timestamp
    ).toMillis() + 1,
  );
  expect(await processAccountDeletion("teacher")).toBe("complete");
  expect(files.has(reservation.uploadPath)).toBe(false);
  expect(memory.documents.has(receipt[0])).toBe(false);
  expect(memory.documents.has("users/teacher")).toBe(false);
});

it("retains the bounded write grace after an ambiguous upload failure so delayed remote bytes are removed", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  memory.documents.set("userPrivate/teacher", { email: "teacher@example.com" });
  save.mockRejectedValueOnce(new Error("Connection lost before confirmation"));
  await expect(
    saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes),
  ).rejects.toThrow("Connection lost");
  const receipt = [...memory.documents].find(([path]) =>
    path.includes("generatedResourcePublications"),
  )!;
  expect((receipt[1].writeUntil as Timestamp).toMillis()).toBeGreaterThan(
    Date.now(),
  );
  await enqueueAccountDeletion("teacher");
  expect(await processAccountDeletion("teacher")).toBe("pending");
  expect(bucket.deleteFiles).not.toHaveBeenCalled();
  // The failed request still completes remotely during its protected grace.
  files.set(reservation.uploadPath, {
    bytes,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  vi.spyOn(Date, "now").mockReturnValue(
    (receipt[1].writeUntil as Timestamp).toMillis() + 1,
  );
  expect(await processAccountDeletion("teacher")).toBe("complete");
  expect(files.has(reservation.uploadPath)).toBe(false);
  expect(memory.documents.has(receipt[0])).toBe(false);
});

it("bounds each cleanup drain so one authenticated action cannot delete an unlimited backlog", async () => {
  for (let index = 0; index < 12; index++) {
    const reservation = await reserveGeneratedResource("teacher", {
      ...input,
      publicationId: `cleanup-${index}`,
    });
    remove.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
    await cancelResourceUpload("teacher", reservation.resourceId);
  }
  expect(await drainGeneratedResourceCleanup("teacher")).toBe(10);
  expect(await drainGeneratedResourceCleanup("teacher")).toBe(2);
  expect(await drainGeneratedResourceCleanup("teacher")).toBe(0);
});

it("keeps a withdrawn published copy removed when export publication is retried", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  await finalizeResourceUpload("teacher", reservation.resourceId, {
    beforeCommit: async () => undefined,
  });
  memory.documents.delete(`resources/${reservation.resourceId}`);
  await expect(reserveGeneratedResource("teacher", input)).rejects.toThrow(
    "not-ready",
  );
});

it("preserves the ordinary manual upload path without internal publication hooks", async () => {
  memory.documents.set("resources/manual-draft", {
    authorId: "teacher",
    status: "draft",
    completionStatus: "incomplete",
    sourcePostId: "post-one",
  });
  const reservation = await reserveResourceUpload("teacher", {
    ...input.metadata,
    draftResourceId: "manual-draft",
    fileName: "manual.pdf",
    fileType: "application/pdf",
    fileSize: bytes.length,
  });
  files.set(reservation.uploadPath, {
    bytes,
    contentType: "application/pdf",
  });
  await finalizeResourceUpload("teacher", reservation.resourceId);
  expect(memory.documents.get("resources/manual-draft")).toMatchObject({
    status: "active",
    fileName: "manual.pdf",
    sourcePostId: "post-one",
  });
  await expect(
    finalizeResourceUpload("teacher", reservation.resourceId),
  ).rejects.toThrow("not-ready");
});

it("checks bytes before writing and refuses the public upload finalization path", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await expect(
    saveGeneratedResourceBytes(
      "teacher",
      reservation.resourceId,
      Buffer.from("different"),
    ),
  ).rejects.toThrow("invalid-upload");
  expect(save).not.toHaveBeenCalled();
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  await expect(
    finalizeResourceUpload("teacher", reservation.resourceId),
  ).rejects.toThrow("not-ready");
  expect(
    memory.documents.get(`resources/${reservation.resourceId}`)?.status,
  ).toBe("uploading");
});

it("validates stored content and preserves a generated reservation for retry", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  files.get(reservation.uploadPath)!.bytes = Buffer.alloc(bytes.length, 0);
  const hooks = { beforeCommit: vi.fn(async () => undefined) };
  await expect(
    finalizeResourceUpload("teacher", reservation.resourceId, hooks),
  ).rejects.toThrow("invalid-upload");
  expect(hooks.beforeCommit).not.toHaveBeenCalled();
  expect(
    memory.documents.get(`resources/${reservation.resourceId}`)?.status,
  ).toBe("uploading");
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  await finalizeResourceUpload("teacher", reservation.resourceId, hooks);
});

it("commits publication and the private receipt atomically after all reads", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  memory.documents.set("users/teacher/teachingExports/export-one", {
    state: "publishing",
  });
  const hooks = {
    beforeCommit: async (tx: FirebaseFirestore.Transaction) => {
      const job = await tx.get(
        db.doc(
          "users/teacher/teachingExports/export-one",
        ) as unknown as FirebaseFirestore.DocumentReference,
      );
      expect(job.data()?.state).toBe("publishing");
    },
    onCommit: (tx: FirebaseFirestore.Transaction, resourceId: string) => {
      tx.update(db.doc("users/teacher/teachingExports/export-one") as never, {
        state: "published",
        resourceId,
      });
    },
  };
  await finalizeResourceUpload("teacher", reservation.resourceId, hooks);
  expect(
    memory.documents.get(`resources/${reservation.resourceId}`)?.status,
  ).toBe("active");
  expect(
    memory.documents.get("users/teacher/teachingExports/export-one"),
  ).toMatchObject({
    state: "published",
    resourceId: reservation.resourceId,
  });
  const initialResource = memory.documents.get(
    `resources/${reservation.resourceId}`,
  );
  const initialActivity = memory.documents.get(
    `posts/activity_resource-published_${reservation.resourceId}`,
  );
  await finalizeResourceUpload("teacher", reservation.resourceId, {
    beforeCommit: async () => undefined,
    onCommit: vi.fn(),
  });
  expect(memory.documents.get(`resources/${reservation.resourceId}`)).toBe(
    initialResource,
  );
  expect(
    memory.documents.get(
      `posts/activity_resource-published_${reservation.resourceId}`,
    ),
  ).toBe(initialActivity);
  expect((await reserveGeneratedResource("teacher", input)).state).toBe(
    "active",
  );
});

it("rolls back all public writes when the source or private export fence is stale", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  await saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes);
  const onCommit = vi.fn();
  await expect(
    finalizeResourceUpload("teacher", reservation.resourceId, {
      beforeCommit: async () => {
        throw new Error("export lease lost");
      },
      onCommit,
    }),
  ).rejects.toThrow("export lease lost");
  expect(onCommit).not.toHaveBeenCalled();
  expect(
    memory.documents.get(`resources/${reservation.resourceId}`)?.status,
  ).toBe("uploading");
  expect(
    [...memory.documents.keys()].some((path) => path.startsWith("posts/")),
  ).toBe(false);
});

it("does not leave an orphan when the resource is removed during the storage write", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  save.mockImplementationOnce(async (path, storedBytes, contentType) => {
    files.set(path, { bytes: storedBytes, contentType });
    memory.documents.delete(`resources/${reservation.resourceId}`);
  });
  await expect(
    saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes),
  ).rejects.toThrow("not-ready");
  expect(files.has(reservation.uploadPath)).toBe(false);
  await expect(reserveGeneratedResource("teacher", input)).rejects.toThrow(
    "not-ready",
  );
});

it("retains cleanup intent if deleting an upload after source removal fails", async () => {
  const reservation = await reserveGeneratedResource("teacher", input);
  save.mockImplementationOnce(async (path, storedBytes, contentType) => {
    files.set(path, { bytes: storedBytes, contentType });
    memory.documents.delete(`resources/${reservation.resourceId}`);
  });
  remove.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
  await expect(
    saveGeneratedResourceBytes("teacher", reservation.resourceId, bytes),
  ).rejects.toThrow("not-ready");
  expect(files.has(reservation.uploadPath)).toBe(true);
  const receipt = [...memory.documents].find(([path]) =>
    path.includes("generatedResourcePublications"),
  )!;
  expect(receipt[1].cleanupPending).toBe(true);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
  expect(await drainGeneratedResourceCleanup("teacher")).toBe(1);
  expect(files.has(reservation.uploadPath)).toBe(false);
});
