"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type UpgradePromptReason =
  | "connections"
  | "messages"
  | "ai-generations"
  | "ai-lessons"
  | "ai-refinements"
  | "lesson-exports";

export const UPGRADE_PROMPTS: Record<
  UpgradePromptReason,
  { title: string; reason: string; benefit: string }
> = {
  connections: {
    title: "Grow your educator network",
    reason: "You’ve reached the Community plan’s five-connection limit.",
    benefit: "Plus unlocks unlimited connections with other educators.",
  },
  messages: {
    title: "Keep the conversation going",
    reason: "You’ve used the Community plan’s 10 messages for today.",
    benefit: "Plus unlocks unlimited daily messaging.",
  },
  "ai-generations": {
    title: "Keep building with AI",
    reason: "You’ve used all Community AI generations for this month.",
    benefit: "Plus includes 50 AI generations every month.",
  },
  "ai-lessons": {
    title: "Create another AI lesson",
    reason: "You’ve used your Community new-lesson allowance this month.",
    benefit: "Plus includes up to 50 new AI lessons each month.",
  },
  "ai-refinements": {
    title: "Keep refining your lessons",
    reason: "You’ve used both Community AI refinements for this month.",
    benefit: "Plus includes up to 50 AI refinements each month.",
  },
  "lesson-exports": {
    title: "Export more lesson plans",
    reason: "You’ve used both Community lesson exports for this month.",
    benefit: "Plus unlocks unlimited lesson exports.",
  },
};

export function LimitUpgradeNotice({
  reasons,
  className,
}: {
  reasons: UpgradePromptReason[];
  className?: string;
}) {
  if (!reasons.length) return null;

  return (
    <aside
      aria-labelledby="limit-upgrade-heading"
      className={cn(
        "border-accent/40 bg-accent/10 rounded-xl border p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-lg">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="limit-upgrade-heading" className="font-serif text-lg">
            Community limit reached
          </h2>
          <div className="mt-2 space-y-2">
            {reasons.map((reason) => {
              const prompt = UPGRADE_PROMPTS[reason];
              return (
                <p key={reason} className="text-sm leading-6">
                  <strong>{prompt.reason}</strong>{" "}
                  <span className="text-muted-foreground">
                    {prompt.benefit}
                  </span>
                </p>
              );
            })}
          </div>
          <Link
            href="/settings/billing"
            className="bg-accent text-accent-foreground mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-bold"
          >
            Upgrade to Plus
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function LimitUpgradeDialog({
  reason,
  onOpenChange,
}: {
  reason: UpgradePromptReason | null;
  onOpenChange: (open: boolean) => void;
}) {
  const prompt = reason ? UPGRADE_PROMPTS[reason] : null;

  return (
    <Dialog.Root open={Boolean(prompt)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 shadow-xl">
          <Dialog.Close
            aria-label="Close upgrade prompt"
            className="text-muted-foreground hover:bg-muted absolute top-3 right-3 grid size-10 place-items-center rounded-lg"
          >
            <X aria-hidden="true" className="size-4" />
          </Dialog.Close>
          <span className="bg-accent text-accent-foreground grid size-11 place-items-center rounded-xl">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <Dialog.Title className="mt-4 pr-8 font-serif text-2xl">
            {prompt?.title ?? "Upgrade to Plus"}
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-3 space-y-2 text-sm leading-6">
              <p className="font-semibold">{prompt?.reason}</p>
              <p className="text-muted-foreground">{prompt?.benefit}</p>
            </div>
          </Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close className="min-h-11 rounded-lg border px-4 text-sm font-bold">
              Maybe later
            </Dialog.Close>
            <Dialog.Close asChild>
              <Link
                href="/settings/billing"
                className="bg-accent text-accent-foreground flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold"
              >
                View Plus plans
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
