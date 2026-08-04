"use client";

import { Download, Lock, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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

  async function remove() {
    const response = await fetch(`/api/resources/${resource.id}`, {
      method: "DELETE",
    });
    if (!response.ok) return toast.error("We couldn't delete this resource.");
    toast.success("Resource deleted.");
    router.push("/resources");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {resource.canDownload ? (
          <a
            href={`/api/resources/${resource.id}/download`}
            className="bg-primary text-primary-foreground flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold"
          >
            <Download aria-hidden="true" className="size-4" />
            Download
          </a>
        ) : (
          <Link
            href="/pricing"
            className="bg-accent text-accent-foreground flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold"
          >
            <Lock aria-hidden="true" className="size-4" />
            Upgrade to download
          </Link>
        )}
        {resource.ownedByViewer && (
          <button
            type="button"
            onClick={() => void remove()}
            className="text-destructive hover:bg-muted grid size-11 place-items-center rounded-lg border"
            title="Delete resource"
            aria-label="Delete resource"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {!resource.ownedByViewer && (
        <section className="bg-card mt-5 rounded-xl border p-5">
          <h2 className="font-serif text-xl">Rate this resource</h2>
          <div className="mt-3 flex gap-1" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setRating(value)}
                aria-label={`${value} stars`}
                className="grid size-8 place-items-center"
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
        </section>
      )}
    </>
  );
}
