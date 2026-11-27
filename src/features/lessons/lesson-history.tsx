"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDialogContent } from "@/components/ui/form-dialog";
import type { LessonDetail, LessonVersionDetail } from "@/lib/lessons/server";
import { LessonContentPreview } from "./lesson-content-preview";
import { accountFetch } from "@/lib/auth/account-fetch";

export function LessonHistory({
  viewerUid,
  lesson,
  disabled,
  onRestore,
}: {
  viewerUid: string;
  lesson: LessonDetail;
  disabled: boolean;
  onRestore: (next: LessonDetail) => void;
}) {
  const [preview, setPreview] = useState<LessonVersionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open(version: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await accountFetch(
        viewerUid,
        `/api/ai-lessons/${lesson.id}/versions/${version}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Version could not be opened.");
      setPreview(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Version could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await accountFetch(
        viewerUid,
        `/api/ai-lessons/${lesson.id}/versions/${preview.version}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: lesson.currentVersion }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Version could not be restored.");
      onRestore(data);
      setPreview(null);
      toast.success(
        "Previous content restored as a new version. No AI action used.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Version could not be restored.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Lesson version history"
      className="surface-card mt-5 p-4"
    >
      <details>
        <summary className="cursor-pointer py-3 font-semibold">
          Version history ({lesson.versions.length})
        </summary>
        <p className="text-muted-foreground mb-3 text-sm">
          Preview your saved versions. Restoring keeps your history and uses no
          AI actions.
        </p>
        <ol className="space-y-2">
          {lesson.versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
            >
              <span>
                Version {version.version} · {version.kind} ·{" "}
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(version.createdAt))}
              </span>
              <Button
                variant="outline"
                disabled={disabled || busy}
                onClick={() => void open(version.version)}
              >
                Preview version {version.version}
              </Button>
            </li>
          ))}
        </ol>
      </details>
      {error && !preview && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}
      <Dialog.Root
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPreview(null);
            setError(null);
          }
        }}
      >
        {preview && (
          <FormDialogContent
            title={`Lesson version ${preview.version}`}
            description={
              lesson.visibility === "published"
                ? "Restoring creates a new version and updates your published lesson."
                : "Restoring creates a new saved version. Your existing history is kept."
            }
            footer={
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  Close preview
                </Button>
                <Button
                  disabled={
                    busy ||
                    disabled ||
                    preview.version === lesson.currentVersion
                  }
                  onClick={() => void restore()}
                >
                  {busy ? "Restoring…" : `Restore version ${preview.version}`}
                </Button>
              </div>
            }
          >
            {preview.sampleMode && (
              <p role="status" className="bg-muted mb-4 rounded-lg p-3 text-sm">
                Sample content: this version was created in demonstration mode.
              </p>
            )}
            {error && (
              <p role="alert" className="text-destructive mb-4 text-sm">
                {error}
              </p>
            )}
            <LessonContentPreview content={preview.content} />
          </FormDialogContent>
        )}
      </Dialog.Root>
    </section>
  );
}
