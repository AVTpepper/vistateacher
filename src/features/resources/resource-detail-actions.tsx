"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, Eye, LoaderCircle, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import type { ResourceDetail } from "@/lib/resources/server";

export function ResourceDetailActions({
  resource,
}: {
  resource: ResourceDetail;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function submitReview() {
    setSubmitting(true);
    const response = await fetch(`/api/resources/${resource.id}/reviews`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, review }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setSubmitting(false);
    if (!response.ok)
      return toast.error(result?.error ?? "We couldn't save your review.");
    setReview("");
    toast.success("Review saved.");
    router.refresh();
  }

  async function remove(): Promise<void> {
    const response = await fetch(`/api/resources/${resource.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("We couldn't delete this resource.");
      return;
    }
    toast.success("Resource deleted.");
    router.push("/resources");
    router.refresh();
  }

  async function editResourceMetadata({
    title,
    description,
    subject,
    gradeLevel,
    tags,
  }: {
    title: string;
    description: string;
    subject: string;
    gradeLevel: string;
    tags: string;
  }): Promise<void> {
    const response = await fetch(`/api/resources/${resource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        subject,
        gradeLevel,
        type: resource.type,
        accessTier: resource.accessTier,
        tags: (tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8),
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(result?.error ?? "We couldn't update this resource.");
    }
    toast.success("Resource updated.");
    router.refresh();
  }

  async function deleteMyReview(): Promise<void> {
    const response = await fetch(`/api/resources/${resource.id}/reviews`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("We couldn't delete your review.");
      return;
    }
    toast.success("Review deleted.");
    router.refresh();
  }

  async function download() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/resources/${resource.id}/download`);
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        throw new Error(result?.error ?? "We couldn't download this resource.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resource.fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Resource downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {resource.sourceLessonId ? (
          <Link
            href={`/lessons/${resource.sourceLessonId}`}
            className="bg-primary text-primary-foreground flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold"
          >
            <Eye aria-hidden="true" className="size-4" />
            View lesson
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading || !resource.canDownload}
            className="bg-primary text-primary-foreground flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            {resource.canDownload ? "Download" : "Download unavailable"}
          </button>
        )}
        {resource.ownedByViewer && (
          <ResourceEditDialog
            resource={resource}
            onSave={editResourceMetadata}
          />
        )}
        {resource.ownedByViewer && (
          <DeleteConfirmDialog itemName="resource" onConfirm={remove}>
            <button
              type="button"
              className="text-destructive hover:bg-muted grid size-11 place-items-center rounded-lg border"
              title="Delete resource"
              aria-label="Delete resource"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </DeleteConfirmDialog>
        )}
      </div>
      {!resource.ownedByViewer && (
        <section className="surface-card mt-5 p-5">
          <h2 className="font-serif text-xl">Rate this resource</h2>
          <div className="mt-3 flex gap-1" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setRating(value)}
                aria-label={`${value} stars`}
                className="grid size-11 place-items-center"
              >
                <Star
                  aria-hidden="true"
                  className={`size-5 ${value <= rating ? "text-amber fill-current" : "text-muted-foreground/30"}`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={review}
            onChange={(event) => setReview(event.target.value)}
            maxLength={1_000}
            rows={3}
            placeholder="What made this useful?"
            className="bg-muted mt-3 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={review.trim().length < 3 || submitting}
            onClick={() => void submitReview()}
            className="bg-primary text-primary-foreground mt-3 h-9 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save review"}
          </button>
          <DeleteConfirmDialog itemName="review" onConfirm={deleteMyReview}>
            <button
              type="button"
              className="text-destructive mt-2 block text-xs font-semibold"
            >
              Delete my review
            </button>
          </DeleteConfirmDialog>
        </section>
      )}
    </>
  );
}

function ResourceEditDialog({
  resource,
  onSave,
}: {
  resource: ResourceDetail;
  onSave: (values: {
    title: string;
    description: string;
    subject: string;
    gradeLevel: string;
    tags: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description);
  const [subject, setSubject] = useState(resource.subject);
  const [gradeLevel, setGradeLevel] = useState(resource.gradeLevel);
  const [tags, setTags] = useState(resource.tags.join(", "));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setTitle(resource.title);
    setDescription(resource.description);
    setSubject(resource.subject);
    setGradeLevel(resource.gradeLevel);
    setTags(resource.tags.join(", "));
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (
      !title.trim() ||
      !description.trim() ||
      !subject.trim() ||
      !gradeLevel.trim() ||
      pending
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        subject: subject.trim(),
        gradeLevel: gradeLevel.trim(),
        tags,
      });
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't update this resource.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild onClick={openDialog}>
        <button
          type="button"
          className="hover:bg-muted h-11 rounded-lg border px-3 text-xs font-bold"
        >
          Edit Metadata
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-2xl">
          <Dialog.Title className="font-serif text-2xl">
            Edit resource
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-sm">
            Update the metadata for this resource.
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close edit resource"
            className="text-muted-foreground hover:bg-muted absolute top-2.5 right-2.5 grid size-11 place-items-center rounded-lg"
          >
            <X aria-hidden="true" className="size-4" />
          </Dialog.Close>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-bold">
              <span>Title</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={140}
                className="resource-input mt-2"
              />
            </label>
            <label className="block text-sm font-bold">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2_000}
                rows={5}
                className="resource-input mt-2 resize-y"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                <span>Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={60}
                  className="resource-input mt-2"
                />
              </label>
              <label className="block text-sm font-bold">
                <span>Grade level</span>
                <input
                  value={gradeLevel}
                  onChange={(event) => setGradeLevel(event.target.value)}
                  maxLength={60}
                  className="resource-input mt-2"
                />
              </label>
            </div>
            <label className="block text-sm font-bold">
              <span>Tags</span>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                maxLength={240}
                className="resource-input mt-2"
              />
            </label>
          </div>
          {error && (
            <p className="text-destructive mt-3 text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={
                pending ||
                !title.trim() ||
                !description.trim() ||
                !subject.trim() ||
                !gradeLevel.trim()
              }
              onClick={() => void submit()}
            >
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
