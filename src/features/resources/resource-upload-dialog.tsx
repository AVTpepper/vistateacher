"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ref, uploadBytesResumable } from "firebase/storage";
import { FileCheck2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormDialogContent } from "@/components/ui/form-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseClient } from "@/lib/firebase/client";
import {
  formatFileSize,
  RESOURCE_FILE_ACCEPT,
  resourceFileContentType,
  resourceFileError,
} from "@/lib/resources/file-validation";
import type { IncompleteResource } from "@/lib/resources/server";
import type { ResourceType } from "@/schemas/resource";

const emptyForm = {
  title: "",
  description: "",
  type: "lesson-plan" as ResourceType,
  subject: "",
  gradeLevel: "",
  tags: "",
  accessTier: "free" as const,
};

function initialForm(draft?: IncompleteResource) {
  if (!draft) return emptyForm;
  return {
    ...emptyForm,
    title: draft.title,
    description: draft.description,
    tags: draft.tags.join(", "),
  };
}

export function ResourceUploadDialog({
  draft,
}: {
  draft?: IncompleteResource;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const gradeLevelRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() => initialForm(draft));

  function reset() {
    setFile(null);
    setFileError(null);
    setServerError(null);
    setErrors({});
    setProgress(0);
    setForm(initialForm(draft));
  }

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    const error = resourceFileError(nextFile);
    if (error) {
      setFile(null);
      setFileError(error);
      toast.error(error);
      return;
    }
    setFileError(null);
    setFile(nextFile);
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    if (form.title.trim().length < 3)
      nextErrors.title = "Enter a title with at least 3 characters.";
    if (form.description.trim().length < 10)
      nextErrors.description =
        "Describe the resource in at least 10 characters.";
    if (form.subject.trim().length < 2)
      nextErrors.subject = "Enter the subject.";
    if (form.gradeLevel.trim().length < 2)
      nextErrors.gradeLevel = "Enter the grade level.";
    if (!file) nextErrors.file = fileError ?? "Choose a file to upload.";
    setErrors(nextErrors);

    const first = Object.keys(nextErrors)[0];
    requestAnimationFrame(() => {
      if (first === "title") titleRef.current?.focus();
      if (first === "description") descriptionRef.current?.focus();
      if (first === "subject") subjectRef.current?.focus();
      if (first === "gradeLevel") gradeLevelRef.current?.focus();
      if (first === "file") fileButtonRef.current?.focus();
    });
    return first === undefined;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !validate() || !file) return;
    const contentType = resourceFileContentType(file.name);
    if (!contentType) return;
    setSubmitting(true);
    setServerError(null);
    setProgress(0);
    let resourceId: string | null = null;
    try {
      const reservationResponse = await fetch("/api/resources/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...(draft ? { draftResourceId: draft.id } : {}),
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 8),
          fileName: file.name,
          fileType: contentType,
          fileSize: file.size,
        }),
      });
      const reservation = (await reservationResponse
        .json()
        .catch(() => null)) as {
        resourceId?: string;
        uploadPath?: string;
        error?: string;
      } | null;
      if (
        !reservationResponse.ok ||
        !reservation?.resourceId ||
        !reservation.uploadPath
      )
        throw new Error(
          reservation?.error ?? "We couldn't reserve this upload.",
        );
      resourceId = reservation.resourceId;

      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(
          ref(getFirebaseClient().storage, reservation.uploadPath),
          file,
          { contentType },
        );
        task.on(
          "state_changed",
          (snapshot) =>
            setProgress(
              Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              ),
            ),
          reject,
          resolve,
        );
      });

      const finalize = await fetch("/api/resources/upload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId }),
      });
      const result = (await finalize.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!finalize.ok)
        throw new Error(result?.error ?? "We couldn't finish this upload.");
      toast.success("Resource published.");
      reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (resourceId) {
        const cleanup = await fetch("/api/resources/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId }),
        }).catch(() => null);
        if (cleanup && !cleanup.ok && cleanup.status !== 404)
          console.error("Resource reservation cleanup failed", resourceId);
      }
      const message =
        error instanceof Error ? error.message : "Resource upload failed.";
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant={draft ? "outline" : "default"}>
          <Upload aria-hidden="true" /> {draft ? "Finish resource" : "Upload"}
        </Button>
      </Dialog.Trigger>
      {open && (
        <FormDialogContent
          title={draft ? "Finish Resource" : "Upload Resource"}
          description={
            draft
              ? "Complete the details and add a classroom-ready file to publish this resource."
              : "Share a classroom-ready file with the details educators need to use it."
          }
          className="sm:max-w-lg"
          footer={
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={submitting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                form="resource-upload-form"
                disabled={submitting}
              >
                {submitting ? `Uploading ${progress}%` : "Upload Resource"}
              </Button>
            </div>
          }
        >
          <form
            id="resource-upload-form"
            className="space-y-4"
            onSubmit={submit}
            noValidate
          >
            <FormField
              id="resource-title"
              label="Resource title"
              required
              error={errors.title}
            >
              {({ describedBy, invalid }) => (
                <Input
                  ref={titleRef}
                  id="resource-title"
                  value={form.title}
                  maxLength={140}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  placeholder="Fraction comparison cards"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      title: value,
                    }));
                    setErrors((current) => ({ ...current, title: "" }));
                  }}
                />
              )}
            </FormField>
            <FormField
              id="resource-description"
              label="Description"
              required
              hint="At least 10 characters."
              error={errors.description}
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  ref={descriptionRef}
                  id="resource-description"
                  value={form.description}
                  maxLength={2_000}
                  rows={3}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  placeholder="Describe what is included and how to use it..."
                  className="resize-y"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      description: value,
                    }));
                    setErrors((current) => ({ ...current, description: "" }));
                  }}
                />
              )}
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="resource-type" label="Type" required>
                <Select
                  id="resource-type"
                  value={form.type}
                  onChange={(event) => {
                    const value = event.currentTarget.value as ResourceType;
                    setForm((current) => ({
                      ...current,
                      type: value,
                    }));
                  }}
                >
                  <option value="lesson-plan">Lesson plan</option>
                  <option value="worksheet">Worksheet</option>
                  <option value="unit-plan">Unit plan</option>
                  <option value="video">Video</option>
                  <option value="activity">Activity</option>
                </Select>
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="resource-subject"
                label="Subject"
                required
                error={errors.subject}
              >
                {({ describedBy, invalid }) => (
                  <Input
                    ref={subjectRef}
                    id="resource-subject"
                    value={form.subject}
                    maxLength={60}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    placeholder="Mathematics"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({
                        ...current,
                        subject: value,
                      }));
                      setErrors((current) => ({ ...current, subject: "" }));
                    }}
                  />
                )}
              </FormField>
              <FormField
                id="resource-grade"
                label="Grade level"
                required
                error={errors.gradeLevel}
              >
                {({ describedBy, invalid }) => (
                  <Input
                    ref={gradeLevelRef}
                    id="resource-grade"
                    value={form.gradeLevel}
                    maxLength={60}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    placeholder="Grades 3-5"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({
                        ...current,
                        gradeLevel: value,
                      }));
                      setErrors((current) => ({ ...current, gradeLevel: "" }));
                    }}
                  />
                )}
              </FormField>
            </div>
            <FormField
              id="resource-tags"
              label="Tags"
              hint="Optional. Separate up to eight tags with commas."
            >
              {({ describedBy }) => (
                <Input
                  id="resource-tags"
                  value={form.tags}
                  maxLength={240}
                  aria-describedby={describedBy}
                  placeholder="Fractions, hands-on, centers"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      tags: value,
                    }));
                  }}
                />
              )}
            </FormField>
            <FormField
              id="resource-file"
              label="Resource file"
              required
              hint="PDF, DOCX, PPTX, JPEG, PNG, WebP, HEIC, HEIF, or MP4 up to 25 MB."
              error={errors.file ?? fileError}
            >
              {({ describedBy, invalid }) => (
                <button
                  ref={fileButtonRef}
                  id="resource-file"
                  type="button"
                  aria-describedby={describedBy}
                  data-invalid={invalid || undefined}
                  onClick={() => inputRef.current?.click()}
                  className="hover:border-primary/40 focus-visible:border-ring data-invalid:border-destructive w-full rounded-xl border-2 border-dashed p-5 text-center transition-colors"
                >
                  {file ? (
                    <FileCheck2
                      aria-hidden="true"
                      className="text-success mx-auto size-6"
                    />
                  ) : (
                    <Upload
                      aria-hidden="true"
                      className="text-muted-foreground mx-auto size-6"
                    />
                  )}
                  <span className="mt-2 block text-sm font-semibold break-all">
                    {file?.name ?? "Choose a file"}
                  </span>
                  {file && (
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {resourceFileContentType(file.name)} ·{" "}
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </button>
              )}
            </FormField>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              accept={RESOURCE_FILE_ACCEPT}
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                setErrors((current) => ({ ...current, file: "" }));
                event.target.value = "";
              }}
            />
            <div aria-live="polite" aria-atomic="true">
              {submitting && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Uploading {file?.name}: {progress}%
                  </p>
                  <div
                    className="bg-muted h-2 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-label="Upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <div
                      className="bg-primary h-full transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {serverError && (
                <p className="text-destructive text-sm" role="alert">
                  {serverError}
                </p>
              )}
            </div>
          </form>
        </FormDialogContent>
      )}
    </Dialog.Root>
  );
}
