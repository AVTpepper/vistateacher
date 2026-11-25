// Browser-only transport. Tokens live only in the session returned to the caller.
// Never send this session to VistaTeacher APIs or persist it in browser storage.
import { isGoogleDriveUploadUri } from "./upload-uri";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SDK_URL = "https://accounts.google.com/gsi/client";
const SDK_ID = "vista-google-drive-authorization";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILE_FIELDS = "id,name,mimeType,trashed";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type GoogleDriveErrorCode =
  | "SDK_NOT_READY"
  | "SDK_LOAD_FAILED"
  | "INVALID_CONFIGURATION"
  | "AUTH_BUSY"
  | "AUTH_TIMEOUT"
  | "AUTH_FAILED"
  | "AUTH_EXPIRED"
  | "ACCESS_DENIED"
  | "POPUP_BLOCKED"
  | "POPUP_CLOSED"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "RATE_LIMITED"
  | "STORAGE_FULL"
  | "SERVICE_UNAVAILABLE"
  | "SESSION_EXPIRED"
  | "INVALID_SESSION_URI"
  | "INVALID_RESPONSE"
  | "INVALID_DOCUMENT"
  | "DOCUMENT_UNAVAILABLE"
  | "UPLOAD_INCOMPLETE";

export class GoogleDriveError extends Error {
  constructor(
    public readonly code: GoogleDriveErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "GoogleDriveError";
  }
}

export interface GoogleDriveSession {
  accessToken: string;
  expiresAt: number;
  account: { id: string; email: string; name: string };
}

export interface GoogleDocResult {
  id: string;
  url: string;
  title: string;
}

export interface GoogleDocUpload {
  exportId: string;
  title: string;
  sourceFingerprint: string;
  byteLength: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
}

interface GoogleAuthorization {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type?: string }) => void;
  }): { requestAccessToken(config: { prompt: "select_account" }): void };
}

function authorization(): GoogleAuthorization | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window as unknown as {
      google?: { accounts?: { oauth2?: GoogleAuthorization } };
    }
  ).google?.accounts?.oauth2;
}

let sdkLoad: Promise<void> | undefined;
let authorizationPending = false;

/** Load on export intent, before rendering the user-gesture Connect button. */
export function loadGoogleDriveAuthorization(): Promise<void> {
  if (authorization()?.initTokenClient) return Promise.resolve();
  if (sdkLoad) return sdkLoad;
  sdkLoad = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(
        new GoogleDriveError("SDK_NOT_READY", "Open export in your browser."),
      );
      return;
    }
    const existing = document.getElementById(SDK_ID);
    if (
      existing &&
      (!(existing instanceof HTMLScriptElement) || existing.src !== SDK_URL)
    ) {
      reject(
        new GoogleDriveError(
          "SDK_LOAD_FAILED",
          "Google authorization could not load.",
          true,
        ),
      );
      return;
    }
    const script = existing ?? document.createElement("script");
    const finish = (error?: GoogleDriveError) => {
      clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const onLoad = () =>
      finish(
        authorization()?.initTokenClient
          ? undefined
          : new GoogleDriveError(
              "SDK_LOAD_FAILED",
              "Google authorization could not load.",
              true,
            ),
      );
    const onError = () =>
      finish(
        new GoogleDriveError(
          "SDK_LOAD_FAILED",
          "Google authorization could not load. Check your connection or browser settings.",
          true,
        ),
      );
    const timer = setTimeout(onError, 15_000);
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.id = SDK_ID;
      (script as HTMLScriptElement).src = SDK_URL;
      (script as HTMLScriptElement).async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    sdkLoad = undefined;
    throw error;
  });
  return sdkLoad;
}

/** Call directly from a click. No asynchronous work runs before opening GIS. */
export function connectGoogleDrive(
  clientId: string,
): Promise<GoogleDriveSession> {
  const oauth = authorization();
  if (!oauth?.initTokenClient) {
    return Promise.reject(
      new GoogleDriveError(
        "SDK_NOT_READY",
        "Load Google authorization before connecting.",
        true,
      ),
    );
  }
  if (!clientId.trim() || clientId.length > 300) {
    return Promise.reject(
      new GoogleDriveError(
        "INVALID_CONFIGURATION",
        "Google Docs export has not been configured.",
      ),
    );
  }
  if (authorizationPending) {
    return Promise.reject(
      new GoogleDriveError(
        "AUTH_BUSY",
        "Finish the existing Google connection first.",
      ),
    );
  }
  authorizationPending = true;
  return new Promise<GoogleDriveSession>((resolve, reject) => {
    let settled = false;
    let tokenReceived = false;
    const finish = (error?: unknown, session?: GoogleDriveSession) => {
      if (settled) return;
      settled = true;
      authorizationPending = false;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(session!);
    };
    const timer = setTimeout(
      () =>
        finish(
          new GoogleDriveError(
            "AUTH_TIMEOUT",
            "Google connection timed out. Connect again.",
            true,
          ),
        ),
      120_000,
    );
    try {
      const client = oauth.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: false,
        callback: (response) => {
          if (settled || tokenReceived) return;
          if (response.error) {
            finish(
              new GoogleDriveError(
                response.error === "access_denied"
                  ? "ACCESS_DENIED"
                  : "AUTH_FAILED",
                "Google Drive access was not granted. You can connect again.",
              ),
            );
            return;
          }
          if (!response.scope?.split(/\s+/).includes(DRIVE_SCOPE)) {
            finish(
              new GoogleDriveError(
                "ACCESS_DENIED",
                "Allow access to files created by VistaTeacher to export.",
              ),
            );
            return;
          }
          const lifetime = Number(response.expires_in);
          if (
            !response.access_token ||
            !Number.isFinite(lifetime) ||
            lifetime <= 15 ||
            lifetime > 86_400
          ) {
            finish(
              new GoogleDriveError(
                "AUTH_FAILED",
                "Google returned an invalid connection. Connect again.",
              ),
            );
            return;
          }
          tokenReceived = true;
          const partial: GoogleDriveSession = {
            accessToken: response.access_token,
            expiresAt: Date.now() + lifetime * 1000,
            account: { id: "", email: "", name: "" },
          };
          void googleRequest(
            partial,
            `${DRIVE_API}/about?fields=user(permissionId,emailAddress,displayName)`,
            {},
            async (result) => {
              const data = record(await result.json());
              const user = record(data?.user);
              const id = user?.permissionId;
              const email = user?.emailAddress;
              if (
                typeof id !== "string" ||
                !/^[a-zA-Z0-9_-]{1,200}$/.test(id) ||
                typeof email !== "string" ||
                !email ||
                email.length > 320
              ) {
                throw new GoogleDriveError(
                  "INVALID_RESPONSE",
                  "Google could not identify the destination account. Connect again.",
                );
              }
              return {
                ...partial,
                account: {
                  id,
                  email,
                  name:
                    typeof user.displayName === "string"
                      ? user.displayName
                      : email,
                },
              };
            },
          ).then((session) => finish(undefined, session), finish);
        },
        error_callback: (error) => {
          if (tokenReceived) return;
          finish(
            new GoogleDriveError(
              error.type === "popup_closed"
                ? "POPUP_CLOSED"
                : error.type === "popup_failed_to_open"
                  ? "POPUP_BLOCKED"
                  : "AUTH_FAILED",
              error.type === "popup_closed"
                ? "Google connection was closed. Connect again when ready."
                : "Allow the Google popup and try connecting again.",
              true,
            ),
          );
        },
      });
      client.requestAccessToken({ prompt: "select_account" });
    } catch {
      finish(
        new GoogleDriveError(
          "POPUP_BLOCKED",
          "Google could not open. Allow popups and connect again.",
          true,
        ),
      );
    }
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requireSession(session: GoogleDriveSession) {
  if (
    !session.accessToken ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= Date.now() + 15_000
  ) {
    throw new GoogleDriveError(
      "AUTH_EXPIRED",
      "Your Google connection expired. Reconnect to continue.",
    );
  }
}

/** A resumable URI is a credential. Accept only Google's exact upload endpoint. */
export function validateGoogleDriveUploadUri(uri: string): string {
  if (!isGoogleDriveUploadUri(uri)) {
    throw new GoogleDriveError(
      "INVALID_SESSION_URI",
      "The saved Google upload session is invalid.",
    );
  }
  return uri;
}

async function responseError(response: Response): Promise<GoogleDriveError> {
  let reasons: string[] = [];
  try {
    const body = record(await response.json());
    const errors = record(body?.error)?.errors;
    if (Array.isArray(errors))
      reasons = errors
        .map((entry) => record(entry)?.reason)
        .filter((reason): reason is string => typeof reason === "string");
  } catch {
    /* Do not surface Google response bodies, which may contain private data. */
  }
  if (response.status === 401)
    return new GoogleDriveError(
      "AUTH_EXPIRED",
      "Your Google connection expired. Reconnect to continue.",
    );
  if (
    response.status === 429 ||
    reasons.some((reason) =>
      ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason),
    )
  )
    return new GoogleDriveError(
      "RATE_LIMITED",
      "Google is receiving too many requests. Try again shortly.",
      true,
    );
  if (reasons.includes("storageQuotaExceeded"))
    return new GoogleDriveError(
      "STORAGE_FULL",
      "Your Google Drive is full. Free some space and retry.",
    );
  if (response.status === 403)
    return new GoogleDriveError(
      "ACCESS_DENIED",
      "Google Drive denied this request. Check your account permissions or reconnect.",
    );
  if (response.status === 404 || response.status === 410)
    return new GoogleDriveError(
      "DOCUMENT_UNAVAILABLE",
      "This Google document is no longer available.",
    );
  if (response.status >= 500)
    return new GoogleDriveError(
      "SERVICE_UNAVAILABLE",
      "Google Drive is temporarily unavailable. Retry to continue.",
      true,
    );
  return new GoogleDriveError(
    "INVALID_RESPONSE",
    "Google Drive could not complete this request.",
  );
}

async function googleRequest<T>(
  session: GoogleDriveSession,
  uri: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  acceptedStatuses: number[] = [],
): Promise<T> {
  requireSession(session);
  // All call sites use fixed endpoints or validateGoogleDriveUploadUri first.
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(
        new GoogleDriveError(
          "REQUEST_TIMEOUT",
          "Google Drive took too long to respond. Retry to continue.",
          true,
        ),
      );
    }, REQUEST_TIMEOUT_MS);
  });
  const request = async () => {
    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.accessToken}`);
      const response = await fetch(uri, {
        ...init,
        headers,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (!response.ok && !acceptedStatuses.includes(response.status))
        throw await responseError(response);
      return await read(response);
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        "NETWORK_ERROR",
        "Google Drive could not be reached. Check your connection and retry.",
        true,
      );
    }
  };
  try {
    return await Promise.race([request(), timedOut]);
  } finally {
    clearTimeout(timeout!);
  }
}

/** Start once, then persist the returned URI before uploading any document bytes. */
export async function startGoogleDocUpload(
  session: GoogleDriveSession,
  input: GoogleDocUpload,
): Promise<string> {
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.exportId) ||
    !/^[a-fA-F0-9]{64}$/.test(input.sourceFingerprint) ||
    !input.title.trim() ||
    input.title.length > 1000 ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength > MAX_DOCUMENT_BYTES
  ) {
    throw new GoogleDriveError(
      "INVALID_DOCUMENT",
      "The saved document is invalid. Prepare a new export.",
    );
  }
  const uri = new URL("https://www.googleapis.com/upload/drive/v3/files");
  uri.searchParams.set("uploadType", "resumable");
  uri.searchParams.set("ignoreDefaultVisibility", "true");
  uri.searchParams.set("fields", FILE_FIELDS);
  return googleRequest(
    session,
    uri.href,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": DOCX_MIME,
        "X-Upload-Content-Length": String(input.byteLength),
      },
      body: JSON.stringify({
        name: input.title.trim(),
        mimeType: DOC_MIME,
        appProperties: {
          vistaExportId: input.exportId,
          vistaSourceFingerprint: input.sourceFingerprint,
        },
      }),
    },
    async (response) =>
      validateGoogleDriveUploadUri(response.headers.get("Location") ?? ""),
  );
}

function documentId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id))
    throw new GoogleDriveError(
      "INVALID_DOCUMENT",
      "The Google document identifier is invalid.",
    );
  return id;
}

function googleDoc(value: unknown): GoogleDocResult | null {
  const file = record(value);
  if (file?.trashed === true) return null;
  if (
    file?.mimeType !== DOC_MIME ||
    typeof file.id !== "string" ||
    typeof file.name !== "string" ||
    !file.name.trim()
  ) {
    throw new GoogleDriveError(
      "INVALID_DOCUMENT",
      "Google did not return a native Google Doc.",
    );
  }
  const id = documentId(file.id);
  return {
    id,
    title: file.name,
    url: `https://docs.google.com/document/d/${id}/edit`,
  };
}

/** No implicit replacement: null means the teacher must choose to make a new copy. */
export function getGoogleDoc(
  session: GoogleDriveSession,
  id: string,
): Promise<GoogleDocResult | null> {
  return googleRequest(
    session,
    `${DRIVE_API}/files/${documentId(id)}?fields=${FILE_FIELDS}`,
    {},
    async (response) =>
      response.status === 404 || response.status === 410
        ? null
        : googleDoc(await response.json()),
    [404, 410],
  );
}

function receivedOffset(response: Response, total: number): number {
  const range = response.headers.get("Range");
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const end = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(end) || end < 0 || end >= total)
    throw new GoogleDriveError(
      "INVALID_RESPONSE",
      "Google returned an invalid upload position. Retry to check the saved upload.",
      true,
    );
  return end + 1;
}

/** Status is always checked first. Retries reuse this URI and these exact bytes. */
export async function resumeGoogleDocUpload(
  session: GoogleDriveSession,
  uri: string,
  bytes: Uint8Array,
): Promise<GoogleDocResult> {
  const uploadUri = validateGoogleDriveUploadUri(uri);
  if (!bytes.byteLength || bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new GoogleDriveError(
      "INVALID_DOCUMENT",
      "The saved document is invalid. Prepare a new export.",
    );
  // Freeze the source even if the caller mutates its array while a request runs.
  const snapshot = new Uint8Array(bytes);
  let offset = 0;
  let probe = true;
  let failures = 0;
  for (let requestCount = 0; requestCount < 8; requestCount++) {
    try {
      const result = await googleRequest(
        session,
        uploadUri,
        {
          method: "PUT",
          headers: {
            "Content-Type": DOCX_MIME,
            "Content-Range": probe
              ? `bytes */${snapshot.byteLength}`
              : `bytes ${offset}-${snapshot.byteLength - 1}/${snapshot.byteLength}`,
          },
          // The browser supplies Content-Length; setting that forbidden header is unreliable.
          body: probe ? undefined : snapshot.slice(offset),
        },
        async (response) => {
          if (response.status === 404 || response.status === 410)
            throw new GoogleDriveError(
              "SESSION_EXPIRED",
              "The saved Google upload expired. Check for an existing document before making another copy.",
            );
          if (response.status === 308)
            return { offset: receivedOffset(response, snapshot.byteLength) };
          const document = googleDoc(await response.json());
          if (!document)
            throw new GoogleDriveError(
              "DOCUMENT_UNAVAILABLE",
              "The uploaded Google document is in the trash.",
            );
          return { document };
        },
        [308, 404, 410],
      );
      if ("document" in result) return result.document!;
      if (result.offset < offset)
        throw new GoogleDriveError(
          "INVALID_RESPONSE",
          "Google returned an inconsistent upload position. Retry to check the saved upload.",
          true,
        );
      offset = result.offset;
      probe = false;
    } catch (error) {
      if (
        !(error instanceof GoogleDriveError) ||
        !error.retryable ||
        ++failures > 2
      )
        throw error;
      // A lost response might already have committed bytes. Probe instead of resending blindly.
      probe = true;
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** (failures - 1)),
      );
    }
  }
  throw new GoogleDriveError(
    "UPLOAD_INCOMPLETE",
    "The upload has not finished. Retry to continue the saved upload.",
    true,
  );
}

export async function downloadGoogleDocPdf(
  session: GoogleDriveSession,
  id: string,
): Promise<Blob> {
  if (!(await getGoogleDoc(session, id)))
    throw new GoogleDriveError(
      "DOCUMENT_UNAVAILABLE",
      "This Google document is no longer available.",
    );
  return googleRequest(
    session,
    `${DRIVE_API}/files/${documentId(id)}/export?mimeType=application%2Fpdf`,
    {},
    async (response) => {
      const bytes = await response.arrayBuffer();
      const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5));
      if (
        bytes.byteLength > MAX_DOCUMENT_BYTES ||
        String.fromCharCode(...header) !== "%PDF-"
      )
        throw new GoogleDriveError(
          "INVALID_RESPONSE",
          "Google did not return a valid PDF. Try the download again.",
          true,
        );
      return new Blob([bytes], { type: "application/pdf" });
    },
  );
}
