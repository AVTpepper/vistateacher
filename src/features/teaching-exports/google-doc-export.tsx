"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, ExternalLink, FileText, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialogContent } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  connectGoogleDrive,
  downloadGoogleDocPdf,
  getGoogleDoc,
  GoogleDriveError,
  loadGoogleDriveAuthorization,
  resumeGoogleDocUpload,
  startGoogleDocUpload,
  type GoogleDocResult,
  type GoogleDriveSession,
} from "@/lib/google-drive/browser";
import { resourceMetadataSchema } from "@/schemas/resource";
import type {
  ExportMetadata,
  TeachingExportJob,
  TeachingExportPublish,
} from "@/schemas/teaching-export";

async function api<T>(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok || !result)
    throw new Error(
      result?.error ?? "The request could not be completed. Try again.",
    );
  return result as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.name !== "TimeoutError"
    ? error.message
    : fallback;
}

async function savedDocument(job: TeachingExportJob): Promise<Uint8Array> {
  const response = await fetch(`/api/teaching-exports/${job.id}/document`, {
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      result?.error ?? "Could not load the saved document. Try again.",
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  if (
    bytes.byteLength !== job.byteLength ||
    hash !== job.binaryHash ||
    hash !== response.headers.get("X-Document-SHA256")
  )
    throw new Error(
      "The saved export could not be verified. Try again before uploading.",
    );
  return bytes;
}

export function GoogleDocExport({
  kind,
  sourceId,
  version,
  mode = "student",
  disabled = false,
}: {
  kind: "lesson" | "worksheet";
  sourceId: string;
  version: number;
  mode?: "student" | "key";
  disabled?: boolean;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID?.trim() ?? "";
  const [open, setOpen] = useState(false);
  const [sdk, setSdk] = useState<"idle" | "loading" | "ready" | "failed">(
    "idle",
  );
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [session, setSession] = useState<GoogleDriveSession | null>(null);
  const [job, setJob] = useState<TeachingExportJob | null>(null);
  const [availableDocument, setAvailableDocument] =
    useState<GoogleDocResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [confirmNewCopy, setConfirmNewCopy] = useState(false);
  const [publishChosen, setPublishChosen] = useState(false);
  const [metadata, setMetadata] = useState<ExportMetadata | null>(null);
  const [tags, setTags] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [publicationFrozen, setPublicationFrozen] = useState(false);
  const publicationAttempt = useRef<TeachingExportPublish | null>(null);
  const loadedJobId = useRef<string | null>(null);
  const contentLabel =
    kind === "lesson"
      ? "Lesson plan"
      : mode === "key"
        ? "Teacher answer key"
        : "Student worksheet — questions only";
  const publishingStarted = Boolean(job?.publication) || publicationFrozen;

  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    void loadGoogleDriveAuthorization().then(
      () => {
        if (!cancelled) setSdk("ready");
      },
      (error: unknown) => {
        if (!cancelled) {
          setSdk("failed");
          setError(
            errorMessage(
              error,
              "Google authorization could not load. Try again.",
            ),
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, clientId, sdkAttempt]);

  function receiveJob(next: TeachingExportJob) {
    setJob(next);
    if (loadedJobId.current !== next.id || next.publication) {
      const details = next.publication?.metadata ?? next.defaults;
      setMetadata(details);
      setTags(details.tags.join(", "));
      setPublishChosen(Boolean(next.publication));
      setResourceId(
        next.publication?.state === "complete"
          ? next.publication.resourceId
          : null,
      );
      setPublicationFrozen(Boolean(next.publication));
      publicationAttempt.current = next.publication
        ? {
            publicationId: next.publication.publicationId,
            metadata: next.publication.metadata,
          }
        : null;
      if (loadedJobId.current !== next.id) {
        setRightsConfirmed(false);
        setKeyConfirmed(false);
        setPublishError("");
      }
      loadedJobId.current = next.id;
    }
    return next;
  }

  async function prepare(connection: GoogleDriveSession) {
    const { job: next } = await api<{ job: TeachingExportJob }>(
      "/api/teaching-exports",
      "POST",
      {
        kind,
        sourceId,
        version,
        mode,
        destination: connection.account,
      },
    );
    receiveJob(next);
    return next;
  }

  async function checkCompletedDocument(
    connection: GoogleDriveSession,
    saved: TeachingExportJob,
  ) {
    if (saved.state !== "complete" || !saved.document) return false;
    const existing = await getGoogleDoc(connection, saved.document.id);
    setAvailableDocument(existing);
    setReplacementReason(
      existing
        ? ""
        : "This Google Doc has been deleted or moved to the trash. You can deliberately make another copy.",
    );
    return true;
  }

  function handleFailure(error: unknown) {
    if (error instanceof GoogleDriveError && error.code === "AUTH_EXPIRED")
      setSession(null);
    if (error instanceof GoogleDriveError && error.code === "SESSION_EXPIRED")
      setReplacementReason(
        "The saved Google upload has expired. Check your Drive for a finished copy before making another.",
      );
    setError(
      errorMessage(
        error,
        "The export could not finish. Retry to continue the saved upload.",
      ),
    );
  }

  async function connect() {
    // GIS must open directly from this click, after the SDK has loaded.
    const connecting = connectGoogleDrive(clientId);
    setBusy("Connecting to Google Drive…");
    setError("");
    try {
      const connection = await connecting;
      setSession(connection);
      if (job && job.destination.id !== connection.account.id) setJob(null);
      setAvailableDocument(null);
      setReplacementReason("");
      setConfirmNewCopy(false);
      const next = await prepare(connection);
      await checkCompletedDocument(connection, next);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function exportDocument() {
    if (!session || busy) return;
    setBusy("Preparing your saved version…");
    setError("");
    let claim: string | null = null;
    let activeJob: TeachingExportJob | null = null;
    try {
      activeJob = await prepare(session);
      if (await checkCompletedDocument(session, activeJob)) return;
      const claimed = await api<{
        job: TeachingExportJob;
        claim: string | null;
      }>(`/api/teaching-exports/${activeJob.id}`, "POST", { action: "claim" });
      activeJob = receiveJob(claimed.job);
      claim = claimed.claim;
      if (!claim && (await checkCompletedDocument(session, activeJob))) return;
      if (!claim)
        throw new Error(
          "This export changed. Reconnect to check its saved Google Doc.",
        );
      const bytes = await savedDocument(activeJob);
      let uri = activeJob.uploadSessionUri;
      if (!uri) {
        uri = await startGoogleDocUpload(session, {
          exportId: activeJob.id,
          title: activeJob.title,
          sourceFingerprint: activeJob.sourceFingerprint,
          byteLength: activeJob.byteLength,
        });
        // No document bytes reach Google until this URI is saved for safe retries.
        const result = await api<{ job: TeachingExportJob }>(
          `/api/teaching-exports/${activeJob.id}`,
          "PATCH",
          { action: "session", claim, uri },
        );
        activeJob = receiveJob(result.job);
      }
      setBusy("Saving your private Google Doc…");
      const document = await resumeGoogleDocUpload(session, uri, bytes);
      const result = await api<{ job: TeachingExportJob }>(
        `/api/teaching-exports/${activeJob.id}`,
        "PATCH",
        { action: "complete", claim, document },
      );
      receiveJob(result.job);
      setAvailableDocument(document);
      setReplacementReason("");
      claim = null;
    } catch (error) {
      handleFailure(error);
    } finally {
      if (claim && activeJob) {
        try {
          await api(`/api/teaching-exports/${activeJob.id}`, "PATCH", {
            action: "release",
            claim,
          });
        } catch {
          /* An expired claim can be retried safely; keep the original error. */
        }
      }
      setBusy(null);
    }
  }

  async function restart() {
    if (!job || !session || busy || !confirmNewCopy) return;
    setBusy("Preparing another copy…");
    setError("");
    try {
      const { job: next } = await api<{ job: TeachingExportJob }>(
        `/api/teaching-exports/${job.id}`,
        "PATCH",
        {
          action: "restart",
          expectedDocumentId: job.document?.id ?? null,
          expectedSessionUri: job.uploadSessionUri,
        },
      );
      receiveJob(next);
      setAvailableDocument(null);
      setReplacementReason("");
      setConfirmNewCopy(false);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    if (!session || !availableDocument || busy) return;
    setBusy("Downloading PDF from Google Docs…");
    setError("");
    try {
      const blob = await downloadGoogleDocPdf(session, availableDocument.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${availableDocument.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 140) || "teaching-resource"}.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (
        error instanceof GoogleDriveError &&
        error.code === "DOCUMENT_UNAVAILABLE"
      ) {
        setAvailableDocument(null);
        setReplacementReason(
          "This Google Doc is no longer available. Choose whether to make another copy.",
        );
      }
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !job ||
      !metadata ||
      busy ||
      !rightsConfirmed ||
      (mode === "key" && !keyConfirmed)
    )
      return;
    setPublishError("");
    if (!publicationAttempt.current) {
      const parsed = resourceMetadataSchema.safeParse({
        ...metadata,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        accessTier: "free",
      });
      if (!parsed.success) {
        setPublishError(
          parsed.error.issues[0]?.message ?? "Review the resource details.",
        );
        return;
      }
      publicationAttempt.current = {
        publicationId: crypto.randomUUID(),
        metadata: { ...parsed.data, accessTier: "free" },
      };
      setPublicationFrozen(true);
    }
    setBusy("Publishing your separate Word copy…");
    try {
      const result = await api<{ resourceId: string }>(
        `/api/teaching-exports/${job.id}/publish`,
        "POST",
        publicationAttempt.current,
      );
      setResourceId(result.resourceId);
    } catch (error) {
      setPublishError(
        errorMessage(
          error,
          "Publishing could not be confirmed. Retry with these same details.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next && clientId && sdk !== "ready") setSdk("loading");
        setOpen(next);
      }}
    >
      <Dialog.Trigger asChild>
        <Button type="button" variant="inverse" disabled={disabled}>
          <FileText aria-hidden="true" />
          Google Docs
        </Button>
      </Dialog.Trigger>
      <FormDialogContent
        title="Export to Google Docs"
        description="Save a private Google Doc, then choose whether to publish a separate resource copy."
      >
        <div className="space-y-5">
          <div className="bg-muted rounded-xl p-4 text-sm">
            <p className="font-bold">
              {contentLabel} · Saved version {version}
            </p>
            <p className="text-muted-foreground mt-1">
              Exports use this saved version. Save any further edits before
              starting a new export.
            </p>
          </div>
          {!clientId ? (
            <p className="text-muted-foreground text-sm">
              Google Docs export is not available yet. Download Word or PDF from
              the Export menu while Google connection setup is completed.
            </p>
          ) : (
            <>
              <section
                className="space-y-3"
                aria-label="Google Drive destination"
              >
                {session ? (
                  <div className="text-sm break-words">
                    <p className="font-bold">Google Drive account</p>
                    <p>
                      {session.account.name} · {session.account.email}
                    </p>
                  </div>
                ) : job ? (
                  <p className="text-sm break-words">
                    Reconnect to continue with {job.destination.email}, or
                    choose another Google account.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Choose the Google account that should own the document.
                    VistaTeacher only requests access to files you create or
                    open with this app.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={sdk !== "ready" || Boolean(busy)}
                  onClick={() => void connect()}
                >
                  {session
                    ? "Change Google account"
                    : job
                      ? "Reconnect Google Drive"
                      : "Connect Google Drive"}
                </Button>
                {sdk === "loading" && (
                  <p role="status" className="text-muted-foreground text-sm">
                    Loading Google connection…
                  </p>
                )}
                {sdk === "failed" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setError("");
                      setSdk("loading");
                      setSdkAttempt((value) => value + 1);
                    }}
                  >
                    Retry loading Google
                  </Button>
                )}
              </section>
              {busy && (
                <p role="status" className="flex items-center gap-2 text-sm">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin"
                  />
                  {busy}
                </p>
              )}
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              {job && !availableDocument && !replacementReason && (
                <Button
                  type="button"
                  disabled={!session || Boolean(busy)}
                  onClick={() => void exportDocument()}
                >
                  {job.state === "complete"
                    ? "Check saved Google Doc"
                    : job.uploadSessionUri
                      ? "Continue saved export"
                      : "Save to Google Docs"}
                </Button>
              )}
              {replacementReason && (
                <div className="space-y-3 rounded-xl border p-4 text-sm">
                  <p>{replacementReason}</p>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                      checked={confirmNewCopy}
                      onChange={(event) =>
                        setConfirmNewCopy(event.target.checked)
                      }
                      disabled={Boolean(busy)}
                    />
                    <span>
                      I checked my Drive. Making another copy may create a
                      duplicate.
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void restart()}
                    disabled={!confirmNewCopy || !session || Boolean(busy)}
                  >
                    Prepare another copy
                  </Button>
                </div>
              )}
              {availableDocument && (
                <section
                  className="border-primary/30 bg-primary/5 space-y-3 rounded-xl border p-4"
                  aria-label="Private Google Doc"
                >
                  <p role="status" className="font-bold">
                    Your private Google Doc is ready
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Your original stays private in your Google Drive. Edits in
                    Google Docs are separate from this saved VistaTeacher
                    version.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <a
                        href={availableDocument.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Google Doc <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!session || Boolean(busy)}
                      onClick={() => void downloadPdf()}
                    >
                      <Download aria-hidden="true" />
                      Download Google PDF
                    </Button>
                  </div>
                </section>
              )}
              {job?.state === "complete" && metadata && (
                <section
                  className="space-y-4 border-t pt-4"
                  aria-label="Community publication"
                >
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 font-bold">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                      checked={publishChosen}
                      onChange={(event) =>
                        setPublishChosen(event.target.checked)
                      }
                      disabled={
                        publishingStarted ||
                        Boolean(resourceId) ||
                        Boolean(busy)
                      }
                    />
                    <span>Publish a Word copy of this saved version</span>
                  </label>
                  {resourceId ? (
                    <div className="space-y-3 text-sm">
                      <p role="status">
                        {job.publication?.available === false
                          ? "This community copy has been removed."
                          : "Community resource copy created."}{" "}
                        Your Google Doc remains private.
                      </p>
                      <p className="text-muted-foreground">
                        Manage or remove your community copies in Resources.
                      </p>
                      {job.publication?.available !== false && (
                        <Button asChild variant="outline">
                          <Link href={`/resources/${resourceId}`}>
                            View published resource
                          </Link>
                        </Button>
                      )}
                    </div>
                  ) : publishChosen ? (
                    <form
                      onSubmit={(event) => void publish(event)}
                      className="space-y-4"
                    >
                      <p className="text-muted-foreground text-sm">
                        The community receives a free Word copy of{" "}
                        {contentLabel.toLowerCase()}, version {job.version}. It
                        excludes your private teaching brief and later Google
                        Docs edits. Publishing is immediate and subject to
                        reporting and moderation.
                      </p>
                      {publishingStarted && (
                        <p className="text-muted-foreground text-sm">
                          These details are saved for a safe publishing retry.
                        </p>
                      )}
                      <fieldset
                        disabled={Boolean(busy) || publishingStarted}
                        className="grid gap-4 disabled:opacity-70"
                      >
                        <label className="grid gap-1.5 text-sm font-bold">
                          Resource title
                          <Input
                            required
                            minLength={3}
                            maxLength={140}
                            value={metadata.title}
                            onChange={(event) =>
                              setMetadata({
                                ...metadata,
                                title: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-bold">
                          Description
                          <Textarea
                            required
                            minLength={10}
                            maxLength={2000}
                            rows={3}
                            value={metadata.description}
                            onChange={(event) =>
                              setMetadata({
                                ...metadata,
                                description: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="grid gap-1.5 text-sm font-bold">
                            Subject
                            <Input
                              required
                              minLength={2}
                              maxLength={60}
                              value={metadata.subject}
                              onChange={(event) =>
                                setMetadata({
                                  ...metadata,
                                  subject: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="grid gap-1.5 text-sm font-bold">
                            Grade or age group
                            <Input
                              required
                              minLength={2}
                              maxLength={60}
                              value={metadata.gradeLevel}
                              onChange={(event) =>
                                setMetadata({
                                  ...metadata,
                                  gradeLevel: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <label className="grid gap-1.5 text-sm font-bold">
                          Tags, separated by commas
                          <Input
                            maxLength={254}
                            value={tags}
                            onChange={(event) => setTags(event.target.value)}
                          />
                          <span className="text-muted-foreground text-xs font-normal">
                            Up to 8 tags, 30 characters each.
                          </span>
                        </label>
                      </fieldset>
                      {mode === "key" && (
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                            checked={keyConfirmed}
                            onChange={(event) =>
                              setKeyConfirmed(event.target.checked)
                            }
                            disabled={Boolean(busy)}
                          />
                          <span>
                            <strong>This copy contains teacher answers.</strong>{" "}
                            I want to make this answer key available to the
                            community.
                          </span>
                        </label>
                      )}
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                          checked={rightsConfirmed}
                          onChange={(event) =>
                            setRightsConfirmed(event.target.checked)
                          }
                          disabled={Boolean(busy)}
                        />
                        <span>
                          I have reviewed this material, have the right to share
                          it, and have removed personal or sensitive student
                          information.
                        </span>
                      </label>
                      {publishError && (
                        <p role="alert" className="text-destructive text-sm">
                          {publishError} Your private Google Doc is kept.
                        </p>
                      )}
                      <Button
                        type="submit"
                        disabled={
                          Boolean(busy) ||
                          !rightsConfirmed ||
                          (mode === "key" && !keyConfirmed)
                        }
                      >
                        {publishingStarted
                          ? "Retry publishing Word copy"
                          : "Publish Word copy"}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Sharing is optional. Publishing creates a separate
                      resource; it does not change access to your Google Doc.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </FormDialogContent>
    </Dialog.Root>
  );
}
