"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";

export function DeleteConfirmDialog({
  children,
  itemName,
  onConfirm,
}: {
  children: React.ReactNode;
  itemName: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Deletion failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
          setError(null);
        }
      }}
    >
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-lg">
          <Dialog.Title className="font-serif text-xl">
            Delete {itemName}?
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2 text-sm">
            This action cannot be undone. Please confirm you want to permanently
            delete this {itemName.toLowerCase()}.
          </Dialog.Description>
          {error && (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4" />
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
