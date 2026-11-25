import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleDriveSession } from "./browser";
import { isGoogleDriveUploadUri } from "./upload-uri";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const URI =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=saved-session";
const FILE = {
  id: "google-doc-123",
  name: "Fractions lesson",
  mimeType: DOC_MIME,
  trashed: false,
};
const RESULT = {
  id: FILE.id,
  title: FILE.name,
  url: "https://docs.google.com/document/d/google-doc-123/edit",
};
const INPUT = {
  exportId: "immutable-export",
  title: "Fractions lesson",
  sourceFingerprint: "a".repeat(64),
  byteLength: 5,
};
const fetchMock = vi.fn<typeof fetch>();
let browser: typeof import("./browser");
let session: GoogleDriveSession;

type AuthorizationConfig = {
  callback(response: {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  }): void;
  error_callback(error: { type?: string }): void;
};

function mockAuthorization() {
  let config: AuthorizationConfig;
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn((value: AuthorizationConfig) => {
    config = value;
    return { requestAccessToken };
  });
  vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });
  return { initTokenClient, requestAccessToken, config: () => config! };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function incomplete(range?: string) {
  return new Response(null, {
    status: 308,
    headers: range ? { Range: range } : {},
  });
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  browser = await import("./browser");
  session = {
    accessToken: "private-token",
    expiresAt: Date.now() + 3_600_000,
    account: {
      id: "permission-123",
      email: "teacher@example.com",
      name: "Teacher",
    },
  };
});

afterEach(() => {
  document.getElementById("vista-google-drive-authorization")?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Google authorization", () => {
  it("loads one official SDK lazily and resolves concurrent callers", async () => {
    expect(document.querySelector("script[src*='gsi/client']")).toBeNull();
    const first = browser.loadGoogleDriveAuthorization();
    const second = browser.loadGoogleDriveAuthorization();
    expect(first).toBe(second);
    const script = document.getElementById(
      "vista-google-drive-authorization",
    ) as HTMLScriptElement;
    expect(script.src).toBe("https://accounts.google.com/gsi/client");
    expect(script.async).toBe(true);
    mockAuthorization();
    script.dispatchEvent(new Event("load"));
    await Promise.all([first, second]);
    expect(document.querySelectorAll("script[src*='gsi/client']")).toHaveLength(
      1,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows retry after SDK load failure and bounds a stalled SDK", async () => {
    vi.useFakeTimers();
    const failed = browser.loadGoogleDriveAuthorization();
    const rejected = expect(failed).rejects.toMatchObject({
      code: "SDK_LOAD_FAILED",
      retryable: true,
    });
    document
      .getElementById("vista-google-drive-authorization")!
      .dispatchEvent(new Event("error"));
    await rejected;
    expect(
      document.getElementById("vista-google-drive-authorization"),
    ).toBeNull();
    const stalled = browser.loadGoogleDriveAuthorization();
    const timeout = expect(stalled).rejects.toMatchObject({
      code: "SDK_LOAD_FAILED",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await timeout;
  });

  it("requires SDK readiness so an awaited load never consumes the connect gesture", async () => {
    await expect(browser.connectGoogleDrive("client-id")).rejects.toMatchObject(
      { code: "SDK_NOT_READY" },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens from the call synchronously, requests only drive.file and identifies the account", async () => {
    const sdk = mockAuthorization();
    fetchMock.mockResolvedValueOnce(
      json({
        user: {
          permissionId: "permission-123",
          emailAddress: "teacher@example.com",
          displayName: "Teacher",
        },
      }),
    );
    const connection = browser.connectGoogleDrive("client-id");
    expect(sdk.requestAccessToken).toHaveBeenCalledWith({
      prompt: "select_account",
    });
    expect(sdk.initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-id",
        scope: SCOPE,
        include_granted_scopes: false,
      }),
    );
    sdk.config().callback({
      access_token: "private-token",
      expires_in: 3600,
      scope: SCOPE,
    });
    expect(await connection).toMatchObject({
      accessToken: "private-token",
      account: session.account,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/drive/v3/about?fields=user(permissionId,emailAddress,displayName)",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer private-token",
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it.each([
    ["popup_closed", "POPUP_CLOSED"],
    ["popup_failed_to_open", "POPUP_BLOCKED"],
  ])("handles %s and permits reconnect", async (type, code) => {
    const sdk = mockAuthorization();
    const connection = browser.connectGoogleDrive("client-id");
    sdk.config().error_callback({ type });
    await expect(connection).rejects.toMatchObject({ code });
    const retry = browser.connectGoogleDrive("client-id");
    sdk.config().callback({ error: "access_denied" });
    await expect(retry).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("rejects denied or missing scope without contacting Drive", async () => {
    const sdk = mockAuthorization();
    const denied = browser.connectGoogleDrive("client-id");
    sdk.config().callback({ error: "access_denied" });
    await expect(denied).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const missingScope = browser.connectGoogleDrive("client-id");
    sdk
      .config()
      .callback({ access_token: "token", expires_in: 3600, scope: "openid" });
    await expect(missingScope).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects overlapping authorization and ignores callbacks after timeout", async () => {
    vi.useFakeTimers();
    const sdk = mockAuthorization();
    const connection = browser.connectGoogleDrive("client-id");
    const expired = expect(connection).rejects.toMatchObject({
      code: "AUTH_TIMEOUT",
    });
    await expect(browser.connectGoogleDrive("client-id")).rejects.toMatchObject(
      { code: "AUTH_BUSY" },
    );
    await vi.advanceTimersByTimeAsync(120_000);
    await expired;
    sdk
      .config()
      .callback({ access_token: "late-token", expires_in: 3600, scope: SCOPE });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Google upload URI boundary", () => {
  it("accepts the documented Google session URI", () => {
    expect(isGoogleDriveUploadUri(URI)).toBe(true);
    expect(browser.validateGoogleDriveUploadUri(URI)).toBe(URI);
  });

  it.each([
    URI.replace("https:", "http:"),
    URI.replace("www.googleapis.com", "www.googleapis.com.evil.test"),
    URI.replace("www.googleapis.com", "www.googleapis.com@evil.test"),
    URI.replace("www.googleapis.com", "user:password@www.googleapis.com"),
    URI.replace("www.googleapis.com", "www.googleapis.com:443"),
    URI.replace("/upload/drive", "/drive"),
    `${URI}#fragment`,
    `${URI}#`,
    `${URI} `,
    `${URI}\n`,
    `${URI}&redirect_uri=https://evil.test`,
    `${URI}&upload_id=other`,
    `${URI}&uploadType=media`,
    URI.replace("saved-session", ""),
    URI.replace("saved-session", "%0d%0a"),
  ])("rejects credential leakage target %s before fetching", async (uri) => {
    expect(isGoogleDriveUploadUri(uri)).toBe(false);
    await expect(
      browser.resumeGoogleDocUpload(session, uri, new Uint8Array([1])),
    ).rejects.toMatchObject({ code: "INVALID_SESSION_URI" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("native Google Docs transport", () => {
  it("starts DOCX-to-native conversion privately with no parents or sharing changes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { Location: URI } }),
    );
    expect(await browser.startGoogleDocUpload(session, INPUT)).toBe(URI);
    const [target, init] = fetchMock.mock.calls[0];
    const url = new URL(String(target));
    expect(url.searchParams.get("ignoreDefaultVisibility")).toBe("true");
    expect(url.searchParams.get("uploadType")).toBe("resumable");
    const metadata = JSON.parse(init!.body as string);
    expect(metadata).toEqual({
      name: INPUT.title,
      mimeType: DOC_MIME,
      appProperties: {
        vistaExportId: INPUT.exportId,
        vistaSourceFingerprint: INPUT.sourceFingerprint,
      },
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Upload-Content-Type")).toBe(DOCX_MIME);
    expect(headers.get("X-Upload-Content-Length")).toBe("5");
    expect(init).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an ambiguous initiation or expose a response error body", async () => {
    fetchMock.mockRejectedValueOnce(new Error("private-token saved-session"));
    await expect(
      browser.startGoogleDocUpload(session, INPUT),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message:
        "Google Drive could not be reached. Check your connection and retry.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an untrusted session returned in Location", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { headers: { Location: "https://evil.test/upload" } }),
    );
    await expect(
      browser.startGoogleDocUpload(session, INPUT),
    ).rejects.toMatchObject({ code: "INVALID_SESSION_URI" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("probes first, resumes the reported Range and snapshots mutable input", async () => {
    fetchMock
      .mockResolvedValueOnce(incomplete("bytes=0-1"))
      .mockResolvedValueOnce(json(FILE));
    const bytes = new Uint8Array([10, 11, 12, 13, 14]);
    const upload = browser.resumeGoogleDocUpload(session, URI, bytes);
    bytes.fill(99);
    expect(await upload).toEqual(RESULT);
    const [probe, write] = fetchMock.mock.calls;
    expect(probe[0]).toBe(URI);
    expect(new Headers(probe[1]?.headers).get("Content-Range")).toBe(
      "bytes */5",
    );
    expect(probe[1]?.body).toBeUndefined();
    expect(write[0]).toBe(URI);
    expect(new Headers(write[1]?.headers).get("Content-Range")).toBe(
      "bytes 2-4/5",
    );
    expect(Array.from(write[1]?.body as Uint8Array)).toEqual([12, 13, 14]);
  });

  it("recognizes a previously completed upload without sending bytes again", async () => {
    fetchMock.mockResolvedValueOnce(json(FILE));
    expect(
      await browser.resumeGoogleDocUpload(session, URI, new Uint8Array([1, 2])),
    ).toEqual(RESULT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("reconciles a lost upload response on the same URI before resending", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(incomplete())
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(incomplete("bytes=0-1"))
      .mockResolvedValueOnce(json(FILE));
    const upload = browser.resumeGoogleDocUpload(
      session,
      URI,
      new Uint8Array([1, 2, 3, 4, 5]),
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(await upload).toEqual(RESULT);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      URI,
      URI,
      URI,
      URI,
    ]);
    expect(fetchMock.mock.calls[2][1]?.body).toBeUndefined();
    expect(
      new Headers(fetchMock.mock.calls[3][1]?.headers).get("Content-Range"),
    ).toBe("bytes 2-4/5");
  });

  it("stops after bounded transient retries without initiating another file", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("offline"));
    const upload = browser.resumeGoogleDocUpload(
      session,
      URI,
      new Uint8Array([1]),
    );
    const rejected = expect(upload).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "PUT"),
    ).toBe(true);
  });

  it("surfaces expired upload sessions without creating a replacement", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(
      browser.resumeGoogleDocUpload(session, URI, new Uint8Array([1])),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects impossible Range values before uploading bytes", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(incomplete("bytes=0-9"));
    const upload = browser.resumeGoogleDocUpload(
      session,
      URI,
      new Uint8Array([1, 2]),
    );
    const rejected = expect(upload).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.body === undefined),
    ).toBe(true);
  });

  it("rejects expired tokens locally and Google 401 responses as reconnectable", async () => {
    await expect(
      browser.getGoogleDoc(
        { ...session, expiresAt: Date.now() + 1000 },
        FILE.id,
      ),
    ).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      json({ error: { message: "private information" } }, 401),
    );
    await expect(browser.getGoogleDoc(session, FILE.id)).rejects.toMatchObject({
      code: "AUTH_EXPIRED",
    });
  });

  it("bounds stalled requests including response body reads", async () => {
    vi.useFakeTimers();
    const response = json(FILE);
    vi.spyOn(response, "json").mockImplementation(() => new Promise(() => {}));
    fetchMock.mockResolvedValueOnce(response);
    const request = browser.getGoogleDoc(session, FILE.id);
    const rejected = expect(request).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it.each([
    [429, "rateLimitExceeded", "RATE_LIMITED"],
    [403, "userRateLimitExceeded", "RATE_LIMITED"],
    [403, "storageQuotaExceeded", "STORAGE_FULL"],
    [403, "insufficientFilePermissions", "ACCESS_DENIED"],
    [503, "backendError", "SERVICE_UNAVAILABLE"],
  ])("maps Google %s %s to a stable UI code", async (status, reason, code) => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { errors: [{ reason }] } }, status),
    );
    await expect(browser.getGoogleDoc(session, FILE.id)).rejects.toMatchObject({
      code,
    });
  });

  it("returns null for unavailable/trashed Docs, rejects Word files, and derives safe native URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ ...FILE, trashed: true }))
      .mockResolvedValueOnce(json({ ...FILE, mimeType: DOCX_MIME }))
      .mockResolvedValueOnce(
        json({ ...FILE, webViewLink: "https://evil.test" }),
      );
    expect(await browser.getGoogleDoc(session, FILE.id)).toBeNull();
    expect(await browser.getGoogleDoc(session, FILE.id)).toBeNull();
    await expect(browser.getGoogleDoc(session, FILE.id)).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    expect(await browser.getGoogleDoc(session, FILE.id)).toEqual(RESULT);
  });

  it("downloads PDF only from a verified native Doc and verifies PDF bytes", async () => {
    fetchMock.mockResolvedValueOnce(json(FILE)).mockResolvedValueOnce(
      new Response("%PDF-1.7\ncontent", {
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    const pdf = await browser.downloadGoogleDocPdf(session, FILE.id);
    expect(pdf.type).toBe("application/pdf");
    expect(pdf.size).toBeGreaterThan(5);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      `/files/${FILE.id}/export?mimeType=application%2Fpdf`,
    );
    fetchMock
      .mockResolvedValueOnce(json(FILE))
      .mockResolvedValueOnce(new Response("<html>error</html>"));
    await expect(
      browser.downloadGoogleDocPdf(session, FILE.id),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
