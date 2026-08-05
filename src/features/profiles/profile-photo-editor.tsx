"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";

export function ProfilePhotoEditor({
  initialPhotoURL,
  displayName,
}: {
  initialPhotoURL: string | null;
  displayName: string;
}) {
  const [photoURL, setPhotoURL] = useState(initialPhotoURL);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Profile images must be 3 MB or smaller.");
      return;
    }

    setPending(true);
    try {
      const form = new FormData();
      form.set("photo", file);
      const response = await fetch("/api/profile/photo", {
        method: "POST",
        body: form,
      });
      const result = (await response.json().catch(() => null)) as {
        photoURL?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.photoURL) {
        throw new Error(
          result?.error ?? "We couldn't update your profile image.",
        );
      }
      setPhotoURL(result.photoURL);
      toast.success("Profile image updated.");
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
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          result?.error ?? "We couldn't remove your profile image.",
        );
      }
      setPhotoURL(null);
      toast.success("Profile image removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border-b pb-6">
      <div className="mb-3">
        <h3 className="text-sm font-bold">Profile image</h3>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          Upload a JPG, PNG, or WebP image up to 3 MB.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <UserAvatar
          name={displayName}
          photoURL={photoURL}
          className="ring-card size-20 rounded-2xl text-xl shadow ring-2"
        />
        <div className="flex flex-wrap gap-2">
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
            {photoURL ? "Replace image" : "Choose image"}
          </Button>
          {photoURL && (
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
      </div>
    </section>
  );
}
