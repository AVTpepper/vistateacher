"use client";

import { Crown, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Plan } from "@/types/models";

export function ProfileCoverEditor({
  initialCoverImageURL,
  plan,
}: {
  initialCoverImageURL: string | null;
  plan: Plan;
}) {
  const [coverImageURL, setCoverImageURL] = useState(initialCoverImageURL);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Cover images must be 5 MB or smaller.");
      return;
    }

    setPending(true);
    try {
      const form = new FormData();
      form.set("cover", file);
      const response = await fetch("/api/profile/cover", {
        method: "POST",
        body: form,
      });
      const result = (await response.json().catch(() => null)) as {
        coverImageURL?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.coverImageURL)
        throw new Error(result?.error ?? "We couldn't update your cover.");
      setCoverImageURL(result.coverImageURL);
      toast.success("Profile cover updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setPending(true);
    try {
      const response = await fetch("/api/profile/cover", { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(result?.error ?? "We couldn't remove your cover.");
      setCoverImageURL(null);
      toast.success("Profile cover removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border-b pb-6">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold">Profile cover</h3>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            Use a wide JPG, PNG, or WebP image up to 5 MB.
          </p>
        </div>
        <span className="bg-accent/10 text-accent flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase">
          <Crown aria-hidden="true" className="size-3" />
          Plus
        </span>
      </div>

      <div className="from-primary/30 to-sidebar-primary/30 relative h-44 overflow-hidden rounded-lg bg-gradient-to-br">
        {coverImageURL && (
          // Profile covers use runtime Firebase Storage origins.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageURL}
            alt="Current profile cover"
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {plan === "plus" ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <ImagePlus aria-hidden="true" />
              )}
              {coverImageURL ? "Replace image" : "Choose image"}
            </Button>
          </>
        ) : (
          <Button asChild type="button" variant="outline">
            <Link href="/settings/billing">
              <Crown aria-hidden="true" />
              Unlock with Plus
            </Link>
          </Button>
        )}
        {coverImageURL && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => void remove()}
          >
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>
    </section>
  );
}
