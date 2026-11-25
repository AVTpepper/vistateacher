"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import type { WorksheetDetail } from "@/lib/worksheets/server";
import type { WorksheetContent } from "@/schemas/worksheet";
import { studentWorksheet } from "@/lib/worksheets/validation";
import {
  answerKeySections,
  studentWorksheetSections,
} from "@/lib/worksheets/document";
import { WorksheetEditor } from "./worksheet-editor";
import { worksheetResult } from "./request";
import { GoogleDocExport } from "@/features/teaching-exports/google-doc-export";

const menuItem =
  "data-[highlighted]:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold outline-none data-[disabled]:opacity-50";
export function WorksheetView({
  uid,
  initial,
}: {
  uid: string;
  initial: WorksheetDetail;
}) {
  const router = useRouter();
  const [worksheet, setWorksheet] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"student" | "key">("student");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    initial.generationStatus === "generating"
      ? "Generation in progress…"
      : "Saved",
  );
  const regenerationRequest = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const working = pending || worksheet.generationStatus === "generating";
  useEffect(() => {
    if (worksheet.generationStatus !== "generating") return;
    let cancelled = false;
    let fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const updated = await worksheetResult<WorksheetDetail>(
          await fetch(`/api/worksheets/${worksheet.id}`),
        );
        if (!cancelled) {
          setWorksheet(updated);
          if (updated.generationStatus === "idle")
            setStatus("Saved worksheet ready");
        }
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error
              ? error.message
              : "Refresh to check generation progress.",
          );
      } finally {
        fetching = false;
      }
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [worksheet.id, worksheet.generationStatus]);
  const tabsId = `worksheet-${worksheet.id}`;
  const sections =
    mode === "student"
      ? studentWorksheetSections(studentWorksheet(worksheet.content))
      : answerKeySections(worksheet.content);
  async function save(content: WorksheetContent, expectedVersion: number) {
    if (pending) return false;
    setPending(true);
    setError("");
    setStatus("Saving…");
    try {
      const updated = await worksheetResult<WorksheetDetail>(
        await fetch(`/api/worksheets/${worksheet.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, expectedVersion }),
        }),
      );
      setWorksheet(updated);
      setEditing(false);
      setStatus("Saved");
      router.refresh();
      requestAnimationFrame(() => {
        heading.current?.focus();
        heading.current?.scrollIntoView({ block: "start" });
      });
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save. Try again.",
      );
      setStatus("Couldn’t save — your edits are kept below");
      return false;
    } finally {
      setPending(false);
    }
  }
  async function regenerate() {
    if (
      pending ||
      !window.confirm(
        "Generate a fresh worksheet from your original brief? This uses 1 AI action. The current worksheet remains in version history.",
      )
    )
      return;
    setPending(true);
    setError("");
    setStatus("Generating…");
    regenerationRequest.current ??= crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/worksheets/${worksheet.id}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedVersion: worksheet.currentVersion,
            requestId: regenerationRequest.current,
          }),
        },
      );
      if (!response.ok && response.status !== 409)
        regenerationRequest.current = null;
      const updated = await worksheetResult<WorksheetDetail>(response);
      setWorksheet(updated);
      setStatus("Saved");
      regenerationRequest.current = null;
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Generation failed.");
      setStatus("Saved version kept");
    } finally {
      setPending(false);
    }
  }
  async function download(
    format: "pdf" | "docx",
    exportMode: "student" | "key",
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/worksheets/${worksheet.id}/export/${format}?mode=${exportMode}`,
      );
      if (!response.ok) {
        await worksheetResult(response);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        `worksheet-${exportMode}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus(
        `${exportMode === "key" ? "Answer key" : "Student worksheet"} ${format === "pdf" ? "PDF" : "Word file"} download started`,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not download. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function restore(version: number) {
    if (
      pending ||
      !window.confirm(
        `Restore version ${version} as a new saved version? This is free and keeps your history.`,
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      const updated = await worksheetResult<WorksheetDetail>(
        await fetch(
          `/api/worksheets/${worksheet.id}/versions/${version}/restore`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: worksheet.currentVersion }),
          },
        ),
      );
      setWorksheet(updated);
      setStatus(
        `Version ${version} restored as version ${updated.currentVersion}`,
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not restore this version.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/worksheets">
          <ArrowLeft />
          Worksheets
        </Link>
      </Button>
      <div className="surface-card overflow-hidden">
        <div className="space-y-4 bg-[#673048] p-5 text-white sm:p-6">
          <div>
            <h1
              ref={heading}
              tabIndex={-1}
              className="font-serif text-3xl break-words"
            >
              {worksheet.title}
            </h1>
            <p className="mt-2 text-sm text-white/90">
              {worksheet.subject} · {worksheet.gradeLevel} ·{" "}
              {worksheet.questionCount}{" "}
              {worksheet.questionCount === 1 ? "question" : "questions"}
            </p>
            <p className="mt-1 text-xs text-white/90">
              Private to you · Version {worksheet.currentVersion}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="inverse"
              onClick={() => {
                setEditing(true);
                setError("");
              }}
              disabled={working || editing}
            >
              <Pencil />
              Edit
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="inverse" disabled={working || editing}>
                  <Download />
                  Export
                  <ChevronDown />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className="bg-card text-card-foreground z-40 min-w-64 rounded-xl border p-1 shadow-xl"
                >
                  <DropdownMenu.Label className="text-muted-foreground px-3 py-2 text-xs font-bold">
                    Student worksheet — questions only
                  </DropdownMenu.Label>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => void download("pdf", "student")}
                  >
                    Download student PDF
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => void download("docx", "student")}
                  >
                    Download student Word
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 border-t" />
                  <DropdownMenu.Label className="text-muted-foreground px-3 py-2 text-xs font-bold">
                    Separate teacher answer key
                  </DropdownMenu.Label>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => void download("pdf", "key")}
                  >
                    Download answer key PDF
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => void download("docx", "key")}
                  >
                    Download answer key Word
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <GoogleDocExport
              key={`${worksheet.id}:${worksheet.currentVersion}:${mode}`}
              kind="worksheet"
              sourceId={worksheet.id}
              version={worksheet.currentVersion}
              mode={mode}
              disabled={working || editing}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="inverse" disabled={working || editing}>
                  <MoreHorizontal />
                  More
                  <ChevronDown />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className="bg-card text-card-foreground z-40 min-w-64 rounded-xl border p-1 shadow-xl"
                >
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => void regenerate()}
                  >
                    <RotateCw />
                    Regenerate · 1 AI action
                  </DropdownMenu.Item>
                  <DeleteConfirmDialog
                    itemName="worksheet"
                    consequence="Google Docs and separately published resource copies remain. Manage them in Google Drive or Resources."
                    onConfirm={async () => {
                      await worksheetResult(
                        await fetch(`/api/worksheets/${worksheet.id}`, {
                          method: "DELETE",
                        }),
                      );
                      router.push("/worksheets");
                      router.refresh();
                    }}
                  >
                    <DropdownMenu.Item
                      className={`${menuItem} text-destructive`}
                      onSelect={(event) => event.preventDefault()}
                    >
                      <Trash2 />
                      Delete worksheet
                    </DropdownMenu.Item>
                  </DeleteConfirmDialog>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
        <div className="space-y-2 px-5 py-3 text-sm">
          <p role="status" aria-live="polite">
            {status}
          </p>
          {worksheet.sampleMode && (
            <p className="text-muted-foreground">
              Sample content: this demonstrates the workflow and was created
              without OpenAI. It is not a classroom-ready AI result.
            </p>
          )}
          {worksheet.reference && (
            <p className="text-muted-foreground">
              Based on “{worksheet.reference.title}”, lesson version{" "}
              {worksheet.reference.version}.
            </p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive surface-card p-4 text-sm">
          {error}
        </p>
      )}
      {editing ? (
        <WorksheetEditor
          key={`${worksheet.id}:${worksheet.currentVersion}`}
          uid={uid}
          worksheetId={worksheet.id}
          content={worksheet.content}
          version={worksheet.currentVersion}
          pending={pending}
          onSave={save}
          onCancel={() => {
            setEditing(false);
            setStatus("Saved");
            setError("");
          }}
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Worksheet content"
            className="surface-card flex gap-1 p-1"
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "student"
                  : event.key === "End"
                    ? "key"
                    : mode === "student"
                      ? "key"
                      : "student";
              setMode(next);
              document.getElementById(`${tabsId}-${next}`)?.focus();
            }}
          >
            {(["student", "key"] as const).map((tab) => (
              <Button
                key={tab}
                id={`${tabsId}-${tab}`}
                role="tab"
                aria-selected={mode === tab}
                tabIndex={mode === tab ? 0 : -1}
                aria-controls={`${tabsId}-panel`}
                variant={mode === tab ? "default" : "ghost"}
                className="min-w-0 flex-1"
                onClick={() => setMode(tab)}
              >
                {tab === "student" ? "Student worksheet" : "Answer key"}
              </Button>
            ))}
          </div>
          <div
            id={`${tabsId}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-${mode}`}
            className="surface-card space-y-6 p-5 sm:p-8"
          >
            {mode === "key" && (
              <h2 className="font-serif text-2xl">
                {worksheet.content.labels.answerKey}
              </h2>
            )}
            {sections.map(([title, items], index) => (
              <section key={`${mode}-${index}`} className="space-y-3">
                <h2 className="font-bold break-words whitespace-pre-wrap">
                  {title}
                </h2>
                {items.map((item, position) => (
                  <p
                    key={position}
                    className="text-muted-foreground overflow-hidden text-sm break-words whitespace-pre-wrap"
                  >
                    {item}
                  </p>
                ))}
              </section>
            ))}
          </div>
          <details className="surface-card p-4">
            <summary className="min-h-11 cursor-pointer py-3 font-bold">
              Version history
            </summary>
            <p className="text-muted-foreground mb-3 text-sm">
              The latest 30 saved versions are listed. Downloads use the current
              saved version.
            </p>
            <ol className="space-y-2 text-sm">
              {worksheet.versions.map((version) => (
                <li
                  key={version.version}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
                >
                  <span>
                    Version {version.version} ·{" "}
                    {version.kind === "restored"
                      ? "Restored"
                      : version.kind === "edited"
                        ? "Teacher edit"
                        : "Generated"}{" "}
                    · {new Date(version.createdAt).toLocaleString("en-US")}
                  </span>
                  {version.version !== worksheet.currentVersion && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void restore(version.version)}
                    >
                      Restore version {version.version}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </div>
  );
}
