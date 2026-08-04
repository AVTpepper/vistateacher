"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { AdminAction } from "@/schemas/admin";

type AdminActionWithoutReason = AdminAction extends infer Action
  ? Action extends AdminAction
    ? Omit<Action, "reason">
    : never
  : never;

export function AdminActionButton({
  action,
  label,
  title,
  variant = "outline",
}: {
  action: AdminActionWithoutReason;
  label: string;
  title: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit() {
    setPending(true);
    const response = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...action, reason }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setPending(false);
    if (!response.ok) {
      toast.error(result?.error ?? "The administrator action failed.");
      return;
    }
    setOpen(false);
    setReason("");
    toast.success("Administrator action completed.");
    router.refresh();
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <Button size="sm" variant={variant}>
          {label}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 shadow-xl">
          <AlertDialog.Title className="font-serif text-2xl">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground mt-2 text-sm leading-6">
            Give a concise reason. It becomes part of the immutable audit log.
          </AlertDialog.Description>
          <label
            className="mt-5 block text-sm font-bold"
            htmlFor="admin-reason"
          >
            Reason
          </label>
          <textarea
            id="admin-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            className="border-input bg-background focus:ring-ring mt-2 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={variant}
              disabled={pending || reason.trim().length < 3}
              onClick={submit}
            >
              {pending && <LoaderCircle className="animate-spin" />}
              Confirm
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
