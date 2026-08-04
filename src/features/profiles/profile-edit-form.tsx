"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { profileUpdateSchema, type ProfileUpdate } from "@/schemas/profile";

export function ProfileEditForm({ initial }: { initial: ProfileUpdate }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = profileUpdateSchema.safeParse({
      displayName: form.get("displayName"),
      gradeLevel: form.get("gradeLevel"),
      subjects: String(form.get("subjects") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      country: form.get("country"),
      city: form.get("city"),
      school: form.get("school"),
      yearsOfExperience: Number(form.get("yearsOfExperience")),
      bio: form.get("bio"),
      website: form.get("website"),
      interests: String(form.get("interests") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Review your profile details.",
      );
      return;
    }

    setPending(true);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    setPending(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "We couldn't save your profile.");
      return;
    }
    toast.success("Profile updated.");
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Display name" id="displayName">
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initial.displayName}
            required
          />
        </Field>
        <Field label="Grade level" id="gradeLevel">
          <Input
            id="gradeLevel"
            name="gradeLevel"
            defaultValue={initial.gradeLevel}
            required
          />
        </Field>
        <Field
          label="Subjects"
          id="subjects"
          hint="Separate multiple subjects with commas."
        >
          <Input
            id="subjects"
            name="subjects"
            defaultValue={initial.subjects.join(", ")}
            required
          />
        </Field>
        <Field label="Years of experience" id="yearsOfExperience">
          <Input
            id="yearsOfExperience"
            name="yearsOfExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={initial.yearsOfExperience}
            required
          />
        </Field>
        <Field label="School or organization" id="school">
          <Input id="school" name="school" defaultValue={initial.school} />
        </Field>
        <Field label="Website" id="website">
          <Input
            id="website"
            name="website"
            type="text"
            inputMode="url"
            defaultValue={initial.website ?? ""}
            placeholder="your-school.org"
          />
        </Field>
        <Field label="City" id="city">
          <Input id="city" name="city" defaultValue={initial.city} required />
        </Field>
        <Field label="Country" id="country">
          <Input
            id="country"
            name="country"
            defaultValue={initial.country}
            required
          />
        </Field>
      </div>
      <Field label="Professional bio" id="bio" hint="Up to 500 characters.">
        <textarea
          id="bio"
          name="bio"
          maxLength={500}
          rows={5}
          defaultValue={initial.bio}
          className="border-input bg-input/60 w-full resize-y rounded-md border px-3 py-3 text-sm"
        />
      </Field>
      <Field
        label="Professional interests"
        id="interests"
        hint="Separate interests with commas."
      >
        <Input
          id="interests"
          name="interests"
          defaultValue={initial.interests.join(", ")}
        />
      </Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Save aria-hidden="true" />
        )}
        Save changes
      </Button>
    </form>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
