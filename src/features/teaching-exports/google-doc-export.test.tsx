import { createHash, randomUUID } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleDocExport } from "./google-doc-export";
import { GoogleDriveError } from "@/lib/google-drive/browser";
import type { TeachingExportJob } from "@/schemas/teaching-export";

const drive = vi.hoisted(() => ({
  load: vi.fn(),
  connect: vi.fn(),
  start: vi.fn(),
  resume: vi.fn(),
  get: vi.fn(),
  pdf: vi.fn(),
}));
vi.mock("@/lib/google-drive/browser", () => {
  class GoogleDriveError extends Error {
    constructor(
      public code: string,
      message: string,
      public retryable = false,
    ) {
      super(message);
    }
  }
  return {
    GoogleDriveError,
    loadGoogleDriveAuthorization: drive.load,
    connectGoogleDrive: drive.connect,
    startGoogleDocUpload: drive.start,
    resumeGoogleDocUpload: drive.resume,
    getGoogleDoc: drive.get,
    downloadGoogleDocPdf: drive.pdf,
  };
});

const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
const binaryHash = createHash("sha256").update(bytes).digest("hex");
const uri =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=saved-upload";
const document = {
  id: "private-doc",
  title: "Food webs",
  url: "https://docs.google.com/document/d/private-doc/edit",
};
const connection = {
  accessToken: "MEMORY_ONLY_TOKEN",
  expiresAt: Date.now() + 3_600_000,
  account: { id: "drive-owner", email: "teacher@example.org", name: "Teacher" },
};
const fetchMock = vi.fn();
let stored: TeachingExportJob;
let downloadedBytes: Uint8Array;
let publishAttempts: unknown[];
let publishFailures: number;

function initialJob(): TeachingExportJob {
  return {
    id: "a".repeat(64),
    title: "Food webs",
    version: 3,
    mode: "student",
    byteLength: bytes.length,
    binaryHash,
    sourceFingerprint: "b".repeat(64),
    state: "ready",
    document: null,
    uploadSessionUri: null,
    destination: connection.account,
    defaults: {
      title: "Food webs",
      description: "A worksheet about local food webs.",
      type: "worksheet",
      subject: "Science",
      gradeLevel: "Grade 5",
      tags: [],
      accessTier: "free",
    },
    publication: null,
  };
}
function jobResponse() {
  return Response.json({ job: structuredClone(stored) });
}
async function connect() {
  fireEvent.click(screen.getByRole("button", { name: "Google Docs" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Drive" }));
  await screen.findByText("Teacher · teacher@example.org");
  await waitFor(() =>
    expect(
      screen.queryByText("Connecting to Google Drive…"),
    ).not.toBeInTheDocument(),
  );
}
function renderExport(mode: "student" | "key" = "student") {
  return render(
    <GoogleDocExport
      kind="worksheet"
      sourceId="worksheet-1"
      version={3}
      mode={mode}
    />,
  );
}
function completeJob() {
  stored.state = "complete";
  stored.document = document;
  stored.uploadSessionUri = uri;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID", "configured-client");
  vi.stubGlobal("crypto", {
    randomUUID,
    subtle: {
      digest: async (_algorithm: string, value: Uint8Array) =>
        Uint8Array.from(createHash("sha256").update(value).digest()).buffer,
    },
  });
  stored = initialJob();
  downloadedBytes = bytes;
  publishAttempts = [];
  publishFailures = 0;
  drive.load.mockResolvedValue(undefined);
  drive.connect.mockResolvedValue(connection);
  drive.get.mockResolvedValue(document);
  drive.start.mockResolvedValue(uri);
  drive.resume.mockImplementation(async () => {
    expect(stored.uploadSessionUri).toBe(uri);
    return document;
  });
  fetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    // Google credentials never belong in a VistaTeacher request.
    expect(JSON.stringify(init)).not.toContain(connection.accessToken);
    if (path === "/api/teaching-exports") return jobResponse();
    if (path.endsWith("/document"))
      return new Response(new Uint8Array(downloadedBytes), {
        headers: { "X-Document-SHA256": binaryHash },
      });
    if (path.endsWith("/publish")) {
      publishAttempts.push(body);
      if (publishFailures-- > 0)
        return Response.json(
          { error: "Community publishing is unavailable." },
          { status: 503 },
        );
      return Response.json({ resourceId: "published-copy" });
    }
    if (body?.action === "claim")
      return Response.json({ job: structuredClone(stored), claim: "claim-1" });
    if (body?.action === "session")
      stored = { ...stored, state: "uploading", uploadSessionUri: body.uri };
    if (body?.action === "complete")
      stored = { ...stored, state: "complete", document: body.document };
    if (body?.action === "restart")
      stored = {
        ...stored,
        state: "ready",
        document: null,
        uploadSessionUri: null,
      };
    return jobResponse();
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Google Docs export", () => {
  it("honestly reports missing setup without loading Google or creating an export", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID", "");
    renderExport();
    fireEvent.click(screen.getByRole("button", { name: "Google Docs" }));
    expect(
      screen.getByRole("dialog", { name: "Export to Google Docs" }),
    ).toHaveTextContent("Google Docs export is not available yet.");
    expect(drive.load).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for SDK readiness and a separate connection click, showing account and saved version", async () => {
    let ready!: () => void;
    drive.load.mockReturnValue(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    renderExport();
    expect(drive.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Google Docs" }));
    expect(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    ).toBeDisabled();
    expect(drive.connect).not.toHaveBeenCalled();
    await act(async () => {
      ready();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Google Drive" }),
    );
    await screen.findByText("Teacher · teacher@example.org");
    expect(
      screen.getByText("Student worksheet — questions only · Saved version 3"),
    ).toBeVisible();
    expect(drive.start).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].body).toContain('"version":3');
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Google Docs" })).toHaveFocus(),
    );
  });

  it("retries the stored upload without creating another Google session or losing frozen bytes", async () => {
    drive.resume
      .mockRejectedValueOnce(
        new GoogleDriveError(
          "NETWORK_ERROR",
          "Drive is temporarily offline.",
          true,
        ),
      )
      .mockResolvedValue(document);
    renderExport();
    await connect();
    fireEvent.click(
      screen.getByRole("button", { name: "Save to Google Docs" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Drive is temporarily offline.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Continue saved export" }),
      ).toBeEnabled(),
    );
    expect(
      fetchMock.mock.calls.some(
        ([, init]) =>
          JSON.parse(String(init?.body ?? "null"))?.action === "release",
      ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue saved export" }),
    );
    await screen.findByRole("link", { name: "Open Google Doc" });
    expect(drive.start).toHaveBeenCalledTimes(1);
    expect(drive.resume).toHaveBeenCalledTimes(2);
    expect(drive.resume.mock.calls[0]).toEqual([connection, uri, bytes]);
    expect(drive.resume.mock.calls[1]).toEqual([connection, uri, bytes]);
    expect(
      screen.getByRole("checkbox", {
        name: "Publish a Word copy of this saved version",
      }),
    ).not.toBeChecked();
  });

  it("rejects a damaged snapshot before sending document bytes to Google", async () => {
    downloadedBytes = new Uint8Array([0, 1, 2]);
    renderExport();
    await connect();
    fireEvent.click(
      screen.getByRole("button", { name: "Save to Google Docs" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "saved export could not be verified",
    );
    expect(drive.start).not.toHaveBeenCalled();
    expect(drive.resume).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save to Google Docs" }),
      ).toBeEnabled(),
    );
  });

  it("keeps the private Doc after a publishing failure and retries one immutable publication", async () => {
    completeJob();
    publishFailures = 1;
    renderExport();
    await connect();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Publish a Word copy of this saved version",
      }),
    );
    fireEvent.change(screen.getByLabelText("Resource title"), {
      target: { value: "Teacher-reviewed food webs" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I have reviewed this material/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish Word copy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your private Google Doc is kept.",
    );
    expect(
      screen.getByRole("link", { name: "Open Google Doc" }),
    ).toHaveAttribute("href", document.url);
    expect(screen.getByLabelText("Resource title")).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry publishing Word copy" }),
    );
    expect(
      await screen.findByRole("link", { name: "View published resource" }),
    ).toHaveAttribute("href", "/resources/published-copy");
    expect(publishAttempts).toHaveLength(2);
    expect(publishAttempts[1]).toEqual(publishAttempts[0]);
    expect(drive.start).not.toHaveBeenCalled();
  });

  it("requires an extra acknowledgement before publishing teacher answers", async () => {
    completeJob();
    stored.mode = "key";
    renderExport("key");
    await connect();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Publish a Word copy of this saved version",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I have reviewed this material/ }),
    );
    expect(
      screen.getByRole("button", { name: "Publish Word copy" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /This copy contains teacher answers/,
      }),
    );
    expect(
      screen.getByRole("button", { name: "Publish Word copy" }),
    ).toBeEnabled();
  });

  it("requires explicit confirmation to replace a missing Doc and never uploads automatically", async () => {
    completeJob();
    drive.get.mockResolvedValue(null);
    renderExport();
    await connect();
    expect(
      screen.getByRole("button", { name: "Prepare another copy" }),
    ).toBeDisabled();
    expect(drive.start).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I checked my Drive/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare another copy" }),
    );
    await screen.findByRole("button", { name: "Save to Google Docs" });
    expect(
      fetchMock.mock.calls.some(
        ([, init]) =>
          JSON.parse(String(init?.body ?? "null"))?.action === "restart",
      ),
    ).toBe(true);
    expect(drive.start).not.toHaveBeenCalled();
    expect(drive.resume).not.toHaveBeenCalled();
  });

  it("rechecks an existing Doc after a network failure without starting another upload", async () => {
    completeJob();
    drive.get
      .mockRejectedValueOnce(
        new GoogleDriveError(
          "NETWORK_ERROR",
          "Google is temporarily offline.",
          true,
        ),
      )
      .mockResolvedValue(document);
    renderExport();
    await connect();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google is temporarily offline.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Check saved Google Doc" }),
    );
    await screen.findByRole("link", { name: "Open Google Doc" });
    expect(drive.get).toHaveBeenCalledTimes(2);
    expect(drive.start).not.toHaveBeenCalled();
    expect(drive.resume).not.toHaveBeenCalled();
  });

  it("reopens pending publication details with their original id for safe recovery", async () => {
    completeJob();
    const metadata = { ...stored.defaults, title: "Previously reviewed title" };
    stored.publication = {
      publicationId: "saved-publication-id",
      metadata,
      resourceId: "reserved-but-not-published",
      state: "pending",
    };
    renderExport();
    await connect();
    expect(screen.getByLabelText("Resource title")).toHaveValue(
      "Previously reviewed title",
    );
    expect(screen.getByLabelText("Resource title")).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "View published resource" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Community resource copy created."),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I have reviewed this material/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry publishing Word copy" }),
    );
    await screen.findByRole("link", { name: "View published resource" });
    expect(publishAttempts[0]).toEqual({
      publicationId: "saved-publication-id",
      metadata,
    });
  });

  it("keeps a removed community copy withdrawn while the private Google Doc remains accessible", async () => {
    completeJob();
    stored.publication = {
      publicationId: "saved-publication-id",
      metadata: stored.defaults,
      resourceId: "withdrawn-copy",
      state: "complete",
      available: false,
    };
    renderExport();
    await connect();
    expect(
      screen.getByText(/This community copy has been removed/),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "View published resource" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Google Doc" })).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: /Publish Word copy|Retry publishing Word copy/,
      }),
    ).not.toBeInTheDocument();
    expect(publishAttempts).toHaveLength(0);
  });
});
