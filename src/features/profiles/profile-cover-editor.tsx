"use client";

import { Crown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { coverThemes, type CoverThemeId } from "@/lib/profiles/cover-themes";
import type { Plan } from "@/types/models";

export function ProfileCoverEditor({
  initialCoverTheme,
  plan,
}: {
  initialCoverTheme: CoverThemeId;
  plan: Plan;
}) {
  const [coverTheme, setCoverTheme] = useState<CoverThemeId>(initialCoverTheme);
  const [pending, setPending] = useState(false);

  async function chooseTheme(theme: CoverThemeId) {
    if (theme === coverTheme) return;
    setPending(true);
    try {
      const response = await fetch("/api/profile/cover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const result = (await response.json().catch(() => null)) as {
        coverTheme?: CoverThemeId;
        error?: string;
      } | null;
      if (!response.ok || !result?.coverTheme) {
        throw new Error(
          result?.error ?? "We couldn't update your cover style.",
        );
      }
      setCoverTheme(result.coverTheme);
      toast.success("Cover style updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed.");
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
            Choose a color or gradient style for your banner.
          </p>
        </div>
        <span className="bg-accent/10 text-accent flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase">
          <Crown aria-hidden="true" className="size-3" />
          Plus
        </span>
      </div>

      <div
        className="relative h-44 overflow-hidden rounded-lg"
        style={{
          background: coverThemes.find((theme) => theme.id === coverTheme)
            ?.background,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {plan === "plus" ? (
          <>
            <div className="mb-2 flex w-full flex-wrap gap-2">
              {coverThemes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  disabled={pending}
                  onClick={() => void chooseTheme(theme.id)}
                  className="group"
                  aria-pressed={coverTheme === theme.id}
                  aria-label={`Choose ${theme.label} cover style`}
                >
                  <span
                    className={`block h-7 w-11 rounded-md border border-black/10 ring-offset-2 transition ${
                      coverTheme === theme.id ? "ring-primary ring-2" : ""
                    }`}
                    style={{ background: theme.background }}
                  />
                  <span className="sr-only">{theme.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <Button asChild type="button" variant="outline">
            <Link href="/settings/billing">
              <Crown aria-hidden="true" />
              Unlock with Plus
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
