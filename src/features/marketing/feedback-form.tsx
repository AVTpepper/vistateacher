"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FeedbackForm({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string;
  defaultEmail?: string;
} = {}) {
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(result?.error);
      form.reset();
      toast.success("Message sent. Check your inbox for a confirmation email.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't send your message.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="feedback-name">Name</Label>
          <Input
            id="feedback-name"
            name="name"
            defaultValue={defaultName}
            autoComplete="name"
            minLength={2}
            maxLength={80}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="feedback-email">Email</Label>
          <Input
            id="feedback-email"
            name="email"
            defaultValue={defaultEmail}
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="feedback-category">What can we help with?</Label>
        <select
          id="feedback-category"
          name="category"
          defaultValue="feedback"
          className="border-input bg-input/60 focus-visible:border-ring h-11 w-full rounded-md border px-3 text-sm shadow-sm outline-none"
        >
          <option value="feedback">Product feedback</option>
          <option value="account">Account access</option>
          <option value="billing">Billing</option>
          <option value="bug">Report a problem</option>
          <option value="other">Something else</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="feedback-message">Message</Label>
        <textarea
          id="feedback-message"
          name="message"
          rows={6}
          minLength={20}
          maxLength={2_000}
          required
          className="border-input bg-input/60 focus-visible:border-ring w-full resize-y rounded-md border px-3 py-2.5 text-sm leading-6 shadow-sm outline-none"
        />
        <p className="text-muted-foreground text-xs">
          Please do not include passwords, payment details, or sensitive student
          information.
        </p>
      </div>
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="feedback-website">Website</Label>
        <Input
          id="feedback-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Send aria-hidden="true" />
        )}
        Send message
      </Button>
    </form>
  );
}
