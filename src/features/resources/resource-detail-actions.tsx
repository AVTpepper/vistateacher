"use client";

import { Download, LoaderCircle, Lock, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
  const [downloadLimitReached, setDownloadLimitReached] = useState(false);

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

  async function editResourceMetadata() {
    const title = window.prompt("Resource title", resource.title);
    if (!title) return;
    const description = window.prompt("Resource description", resource.description);
    if (!description) return;
    const subject = window.prompt("Subject", resource.subject);
    if (!subject) return;
    const gradeLevel = window.prompt("Grade level", resource.gradeLevel);
    if (!gradeLevel) return;
    const tags = window.prompt("Tags (comma-separated)", resource.tags.join(", "));
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
    if (!response.ok) return toast.error("We couldn't update this resource.");
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
        if (result?.code === "download-limit-reached")
          setDownloadLimitReached(true);
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

  const canDownload = resource.canDownload && !downloadLimitReached;
  const limitReached =
    resource.downloadBlockReason === "download-limit-reached" ||
    downloadLimitReached;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canDownload ? (
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="bg-primary text-primary-foreground flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold"
          >
            {downloading ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            Download
          </button>
        ) : (
          <Link
            href="/settings/billing"
            className="bg-accent text-accent-foreground flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold"
          >
            <Lock aria-hidden="true" className="size-4" />
            {limitReached
              ? "Monthly download limit reached"
              : "Upgrade to download"}
          </Link>
        )}
        {resource.ownedByViewer && (
          <button
            type="button"
            onClick={() => void editResourceMetadata()}
            className="hover:bg-muted h-11 rounded-lg border px-3 text-xs font-bold"
          >
            Edit Metadata
          </button>
        )}
        {resource.ownedByViewer && (
          <DeleteConfirmDialog
            itemName="resource"
            onConfirm={remove}
          >
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
          <DeleteConfirmDialog
            itemName="review"
            onConfirm={deleteMyReview}
          >
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
