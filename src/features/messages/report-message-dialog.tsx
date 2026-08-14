"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { DirectMessage } from "@/lib/messages/server";

export function ReportMessageDialog({ message }: { message: DirectMessage }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");

  async function submit() {
    const response = await fetch(
      `/api/messages/${message.conversationId}/report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, reason, details }),
      },
    );
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok)
      return toast.error(result?.error ?? "We couldn't submit this report.");
    toast.success("Report submitted.");
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Report message"
          title="Report message"
          className="hover:text-destructive grid size-11 place-items-center rounded-lg"
        >
          <Flag aria-hidden="true" className="size-3" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-card fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-lg">
          <Dialog.Title className="font-serif text-xl">
            Report message
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-sm">
            Send this message to platform moderators.
          </Dialog.Description>
          <label className="mt-4 block text-sm font-bold">
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="bg-background mt-1.5 w-full rounded-lg border px-3 py-2 font-normal"
            >
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="misinformation">Misinformation</option>
              <option value="unsafe">Unsafe content</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="mt-3 block text-sm font-bold">
            Details
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={500}
              rows={3}
              className="bg-background mt-1.5 w-full rounded-lg border px-3 py-2 font-normal"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="rounded-lg border px-4 py-2 text-sm font-bold">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={() => void submit()}
              className="bg-destructive text-destructive-foreground rounded-lg px-4 py-2 text-sm font-bold"
            >
              Submit report
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
