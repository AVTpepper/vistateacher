"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Flag } from "lucide-react";
import { useRef, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDialogContent } from "@/components/ui/form-dialog";
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportDetails,
} from "@/schemas/report";

export function ReportContentDialog({
  title,
  endpoint,
  payload = {},
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
}: {
  title: string;
  endpoint: string;
  payload?: Record<string, string>;
  trigger?: ReactElement | false;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const [reason, setReason] = useState<ReportDetails["reason"]>("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  function changeOpen(next: boolean) {
    if (lock.current) return;
    setLocalOpen(next);
    onOpenChange?.(next);
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, reason, details }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = (await response.json().catch(() => null)) as {
        reported?: boolean;
        code?: string;
        error?: string;
      } | null;
      const alreadyReported =
        response.status === 409 && result?.code === "already-reported";
      if (
        (!response.ok && !alreadyReported) ||
        (response.ok && result?.reported !== true)
      )
        throw new Error(result?.error ?? "We couldn't submit this report.");
      lock.current = false;
      changeOpen(false);
      if (alreadyReported)
        toast.info("We already have your report for this content.");
      else toast.success("Report submitted for review.");
      setDetails("");
      setReason("spam");
    } catch (cause) {
      setError(
        cause instanceof Error &&
          !(cause instanceof TypeError) &&
          cause.name !== "TimeoutError" &&
          cause.name !== "AbortError"
          ? cause.message
          : "The report could not be sent. Your details are kept; please try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      {trigger !== false && (
        <Dialog.Trigger asChild>
          {trigger ?? (
            <Button variant="outline" aria-label={title}>
              <Flag aria-hidden="true" /> Report
            </Button>
          )}
        </Dialog.Trigger>
      )}
      <FormDialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        title={title}
        closeDisabled={pending}
        description="Tell the VistaTeacher moderators what needs their attention."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => void submit()}>
              {pending ? "Submitting..." : "Submit report"}
            </Button>
          </div>
        }
      >
        <label className="grid gap-1.5 text-sm font-bold">
          Reason
          <select
            value={reason}
            disabled={pending}
            onChange={(event) =>
              setReason(event.target.value as ReportDetails["reason"])
            }
            className="bg-background min-h-11 rounded-lg border px-3 font-normal"
          >
            {REPORT_REASONS.map((value) => (
              <option key={value} value={value}>
                {REPORT_REASON_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 grid gap-1.5 text-sm font-bold">
          Details (optional)
          <textarea
            value={details}
            disabled={pending}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={500}
            rows={4}
            className="bg-background rounded-lg border px-3 py-2 font-normal"
          />
        </label>
        {error && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {error}
          </p>
        )}
      </FormDialogContent>
    </Dialog.Root>
  );
}
