"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PrivateSettings } from "@/schemas/profile";

export function PrivacySettingsForm({
  initial,
  deletionRequested,
  billing,
}: {
  initial: PrivateSettings;
  deletionRequested: boolean;
  billing: {
    effectivePlan: "free" | "plus";
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}) {
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setPending(false);
    if (response.ok) toast.success("Settings saved.");
    else toast.error("We couldn't save your settings.");
  }

  return (
    <div className="space-y-5">
      <form className="bg-card rounded-xl border p-6" onSubmit={save}>
        <h2 className="font-serif text-xl">Contact and privacy</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Contact details remain private unless you explicitly share them.
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="professionalEmail">Professional email</Label>
            <Input
              id="professionalEmail"
              type="email"
              value={settings.contactDetails.professionalEmail}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  contactDetails: {
                    ...current.contactDetails,
                    professionalEmail: event.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Professional phone</Label>
            <Input
              id="phone"
              type="tel"
              value={settings.contactDetails.phone}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  contactDetails: {
                    ...current.contactDetails,
                    phone: event.target.value,
                  },
                }))
              }
            />
          </div>
        </div>
        <ToggleRow
          label="Show these contact details on my educator profile"
          description="Anyone viewing your profile can use the contact information above."
          checked={settings.privacySettings.shareContactInfo}
          onChange={(checked) =>
            setSettings((current) => ({
              ...current,
              privacySettings: { shareContactInfo: checked },
            }))
          }
        />
        <div className="mt-6 border-t pt-6">
          <h3 className="text-sm font-bold">Notifications</h3>
          <ToggleRow
            label="Email notifications"
            description="Receive important account and community updates by email."
            checked={settings.notificationSettings.email}
            onChange={(checked) =>
              setSettings((current) => ({
                ...current,
                notificationSettings: {
                  ...current.notificationSettings,
                  email: checked,
                },
              }))
            }
          />
          <ToggleRow
            label="In-app notifications"
            description="Show activity updates inside VistaTeacher."
            checked={settings.notificationSettings.inApp}
            onChange={(checked) =>
              setSettings((current) => ({
                ...current,
                notificationSettings: {
                  ...current.notificationSettings,
                  inApp: checked,
                },
              }))
            }
          />
        </div>
        <Button className="mt-6" type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save settings
        </Button>
      </form>
        <DeletionPanel requested={deletionRequested} billing={billing} />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-5 flex cursor-pointer items-center justify-between gap-5">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-5">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        className="accent-primary size-5 shrink-0"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function DeletionPanel({
  requested,
  billing,
}: {
  requested: boolean;
  billing: {
    effectivePlan: "free" | "plus";
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(requested);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const periodEndLabel = formatDate(billing?.currentPeriodEnd ?? null);
  const billingMessage =
    billing?.effectivePlan === "plus"
      ? billing.cancelAtPeriodEnd
        ? periodEndLabel
          ? `Your Plus membership is already scheduled to end on ${periodEndLabel}.`
          : "Your Plus membership is already scheduled to end at the end of this billing period."
        : periodEndLabel
          ? `If you continue, Plus billing will also be cancelled so access runs until ${periodEndLabel}.`
          : "If you continue, Plus billing will also be cancelled so access runs until the end of this billing period."
      : null;

  async function confirmDeletion() {
    setPending(true);
    try {
      if (billing?.effectivePlan === "plus" && !billing.cancelAtPeriodEnd) {
        const billingResponse = await fetch("/api/billing/subscription", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelAtPeriodEnd: true }),
        });
        const billingResult = (await billingResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!billingResponse.ok) {
          throw new Error(billingResult?.error ?? "We couldn't cancel billing.");
        }
      }

      const response = await fetch("/api/settings/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "We couldn't delete your account.");
      }

      setComplete(true);
      setOpen(false);
      toast.success("Account deletion recorded.");
      if (billing?.effectivePlan === "plus") {
        toast.success(
          billing.cancelAtPeriodEnd
            ? "Plus billing is already set to end at the current billing boundary."
            : "Plus billing has been set to end at the current billing boundary.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bg-card border-destructive/25 rounded-xl border p-6">
      <h2 className="text-destructive flex items-center gap-2 font-serif text-xl">
        <Trash2 aria-hidden="true" className="size-5" />
        Delete account
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Delete your account and account data after you confirm the warning
        below.
      </p>
      {complete ? (
        <p className="bg-muted mt-4 rounded-lg px-4 py-3 text-sm font-semibold">
          Your account deletion has been recorded.
        </p>
      ) : (
        <AlertDialog.Root open={open} onOpenChange={setOpen}>
          <AlertDialog.Trigger asChild>
            <Button className="mt-5" variant="destructive">
              Delete account
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay
              className="fixed inset-0 z-50 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <AlertDialog.Content
              className="bg-card fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-xl border p-4 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
            >
              <AlertDialog.Title className="font-serif text-xl sm:text-2xl">
                Delete your account?
              </AlertDialog.Title>
              <AlertDialog.Description className="text-muted-foreground mt-3 text-sm leading-6">
                This will record your account for deletion. Type DELETE to
                confirm.
              </AlertDialog.Description>
              {billingMessage && (
                <div className="bg-muted mt-4 rounded-lg px-4 py-3 text-sm leading-6">
                  {billingMessage}
                </div>
              )}
              <ul className="text-muted-foreground mt-4 space-y-2 text-sm leading-6">
                <li>• Your account will be marked for deletion.</li>
                <li>• Your profile, settings, and private access will be removed from normal use.</li>
                <li>• If you are on Plus, billing will end at the current billing boundary.</li>
              </ul>
              <Input
                className="mt-5"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-label="Type DELETE to confirm"
              />
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel asChild>
                  <Button className="w-full sm:w-auto" variant="outline">
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  className="w-full sm:w-auto"
                  variant="destructive"
                  onClick={() => void confirmDeletion()}
                  disabled={pending || confirmation !== "DELETE"}
                >
                  {pending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : null}
                  Delete account
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </section>
  );
}
