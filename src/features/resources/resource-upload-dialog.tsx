"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ref, uploadBytesResumable } from "firebase/storage";
import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { getFirebaseClient } from "@/lib/firebase/client";
import type { ResourceAccess, ResourceType } from "@/schemas/resource";

const acceptedTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
];

export function ResourceUploadDialog() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "lesson-plan" as ResourceType,
    subject: "",
    gradeLevel: "",
    tags: "",
    accessTier: "free" as ResourceAccess,
  });

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!acceptedTypes.includes(nextFile.type)) {
      toast.error("Choose a PDF, DOCX, PPTX, image, or MP4 file.");
      return;
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      toast.error("Resource files must be 25 MB or smaller.");
      return;
    }
    setFile(nextFile);
  }

  async function submit() {
    if (!file || submitting) return;
    setSubmitting(true);
    let resourceId: string | null = null;
    try {
      const reservationResponse = await fetch("/api/resources/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 8),
          fileName: file.name,
          fileType: file.type,
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
          { contentType: file.type },
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
      setOpen(false);
      setFile(null);
      setProgress(0);
      setForm({
        title: "",
        description: "",
        type: "lesson-plan",
        subject: "",
        gradeLevel: "",
        tags: "",
        accessTier: "free",
      });
      router.refresh();
    } catch (error) {
      if (resourceId)
        await fetch("/api/resources/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId }),
        }).catch(() => undefined);
      toast.error(
        error instanceof Error ? error.message : "Resource upload failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const valid =
    form.title.trim().length >= 3 &&
    form.description.trim().length >= 10 &&
    form.subject.trim().length >= 2 &&
    form.gradeLevel.trim().length >= 2 &&
    file;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !submitting && setOpen(next)}
    >
      <Dialog.Trigger className="bg-primary text-primary-foreground flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold">
        <Upload aria-hidden="true" className="size-4" /> Upload
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-2xl sm:p-6">
          <Dialog.Title className="font-serif text-2xl">
            Upload Resource
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-sm">
            Share a classroom-ready file with useful context.
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close upload"
            className="text-muted-foreground hover:bg-muted absolute top-4 right-4 grid size-8 place-items-center rounded-lg"
          >
            <X aria-hidden="true" className="size-4" />
          </Dialog.Close>
          <div className="mt-5 space-y-4">
            <Field label="Resource title">
              <input
                value={form.title}
                maxLength={140}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Fraction comparison cards"
                className="resource-input"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                maxLength={2_000}
                rows={3}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Describe what is included and how to use it..."
                className="resource-input resize-none"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      type: event.target.value as ResourceType,
                    })
                  }
                  className="resource-input"
                >
                  <option value="lesson-plan">Lesson plan</option>
                  <option value="worksheet">Worksheet</option>
                  <option value="unit-plan">Unit plan</option>
                  <option value="video">Video</option>
                  <option value="activity">Activity</option>
                </select>
              </Field>
              <Field label="Access">
                <select
                  value={form.accessTier}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      accessTier: event.target.value as ResourceAccess,
                    })
                  }
                  className="resource-input"
                >
                  <option value="free">Available to everyone</option>
                  <option value="plus">Plus members</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject">
                <input
                  value={form.subject}
                  maxLength={60}
                  onChange={(event) =>
                    setForm({ ...form, subject: event.target.value })
                  }
                  placeholder="Mathematics"
                  className="resource-input"
                />
              </Field>
              <Field label="Grade level">
                <input
                  value={form.gradeLevel}
                  maxLength={60}
                  onChange={(event) =>
                    setForm({ ...form, gradeLevel: event.target.value })
                  }
                  placeholder="Grades 3-5"
                  className="resource-input"
                />
              </Field>
            </div>
            <Field label="Tags">
              <input
                value={form.tags}
                maxLength={240}
                onChange={(event) =>
                  setForm({ ...form, tags: event.target.value })
                }
                placeholder="Fractions, hands-on, centers"
                className="resource-input"
              />
            </Field>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="hover:border-primary/40 w-full rounded-xl border-2 border-dashed p-6 text-center transition-colors"
            >
              <Upload
                aria-hidden="true"
                className="text-muted-foreground mx-auto size-6"
              />
              <span className="mt-2 block text-sm font-semibold">
                {file?.name ?? "Choose a file"}
              </span>
              <span className="text-muted-foreground mt-1 block text-xs">
                PDF, DOCX, PPTX, image, or MP4 up to 25 MB
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.pptx,image/jpeg,image/png,image/webp,video/mp4"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {submitting && (
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-[width]"
                  style={{ width: `${Math.max(5, progress)}%` }}
                />
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="hover:bg-muted h-10 rounded-lg px-4 text-sm font-semibold">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={!valid || submitting}
              onClick={() => void submit()}
              className="bg-primary text-primary-foreground h-10 rounded-lg px-5 text-sm font-bold disabled:opacity-50"
            >
              {submitting ? `Uploading ${progress}%` : "Upload Resource"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold">
      <span className="text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
