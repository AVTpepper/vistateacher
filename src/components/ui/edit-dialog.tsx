"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function EditTextDialog({
  trigger,
  title,
  description,
  label,
  value,
  maxLength,
  rows = 4,
  placeholder,
  saveLabel = "Save changes",
  onSave,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  label: string;
  value: string;
  maxLength: number;
  rows?: number;
  placeholder?: string;
  saveLabel?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setDraft(value);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    const nextValue = draft.trim();
    if (!nextValue || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSave(nextValue);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We couldn't save changes.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild onClick={openDialog}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-2xl">
          <Dialog.Title className="font-serif text-xl">{title}</Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-sm">
            {description}
          </Dialog.Description>
          <Dialog.Close
            aria-label={`Close ${title.toLowerCase()}`}
            className="text-muted-foreground hover:bg-muted absolute top-2.5 right-2.5 grid size-11 place-items-center rounded-lg"
          >
            <X aria-hidden="true" className="size-4" />
          </Dialog.Close>
          <label className="mt-5 block text-sm font-bold">
            <span>{label}</span>
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={maxLength}
              rows={rows}
              placeholder={placeholder}
              className="border-accent bg-input/60 text-foreground placeholder:text-muted-foreground mt-2 w-full resize-y rounded-lg border px-3 py-2.5 text-base md:text-sm"
            />
          </label>
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
              disabled={pending || !draft.trim()}
              onClick={() => void submit()}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              {saveLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
