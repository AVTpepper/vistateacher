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
}: {
  initial: PrivateSettings;
  deletionRequested: boolean;
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
      <DeletionPanel requested={deletionRequested} />
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

function DeletionPanel({ requested }: { requested: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(requested);
  async function requestDeletion() {
    const response = await fetch("/api/settings/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    if (response.ok) {
      setComplete(true);
      toast.success("Deletion request recorded.");
    } else toast.error("Type DELETE to confirm.");
  }
  return (
    <section className="bg-card border-destructive/25 rounded-xl border p-6">
      <h2 className="text-destructive flex items-center gap-2 font-serif text-xl">
        <Trash2 aria-hidden="true" className="size-5" />
        Account deletion
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        Request review and permanent deletion of your account data. This does
        not immediately remove your account.
      </p>
      {complete ? (
        <p className="bg-muted mt-4 rounded-lg px-4 py-3 text-sm font-semibold">
          Your deletion request has been recorded.
        </p>
      ) : (
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <Button className="mt-5" variant="destructive">
              Request account deletion
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <AlertDialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
              <AlertDialog.Title className="font-serif text-2xl">
                Request account deletion?
              </AlertDialog.Title>
              <AlertDialog.Description className="text-muted-foreground mt-3 text-sm leading-6">
                Type DELETE to confirm. A request will be recorded for review.
              </AlertDialog.Description>
              <Input
                className="mt-5"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-label="Type DELETE to confirm"
              />
              <div className="mt-6 flex justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button variant="outline">Cancel</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button
                    variant="destructive"
                    onClick={requestDeletion}
                    disabled={confirmation !== "DELETE"}
                  >
                    Confirm request
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </section>
  );
}
