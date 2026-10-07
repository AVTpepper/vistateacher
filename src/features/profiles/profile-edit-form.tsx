"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJson } from "@/lib/http/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField as Field } from "@/components/ui/form-field";
import { ChoiceFieldset, Choice } from "@/components/ui/choice-field";
import { ProfileCoverEditor } from "@/features/profiles/profile-cover-editor";
import { ProfilePhotoEditor } from "@/features/profiles/profile-photo-editor";
import type { CoverThemeId } from "@/lib/profiles/cover-themes";
import {
  educationStages,
  professionalRoles,
  subjectAreas,
  taughtLanguages,
} from "@/lib/profiles/options";
import { profileUpdateSchema, type ProfileUpdate } from "@/schemas/profile";
import type { Plan } from "@/types/models";

export function ProfileEditForm({
  initial,
  initialPhotoURL,
  initialCoverTheme,
  plan,
}: {
  initial: ProfileUpdate;
  initialPhotoURL: string | null;
  initialCoverTheme: CoverThemeId;
  plan: Plan;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedRoles, setSelectedRoles] = useState(initial.professionalRoles);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    initial.subjects,
  );
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    initial.languages,
  );

  function toggleSubject(subject: string) {
    const next = selectedSubjects.includes(subject)
      ? selectedSubjects.filter((value) => value !== subject)
      : [...selectedSubjects, subject];
    if (subject === "Languages" && selectedSubjects.includes(subject)) {
      setSelectedLanguages([]);
    }
    setSelectedSubjects(next);
  }

  function toggleLanguage(language: string) {
    const next = selectedLanguages.includes(language)
      ? selectedLanguages.filter((value) => value !== language)
      : [...selectedLanguages, language];
    setSelectedLanguages(next);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const parsed = profileUpdateSchema.safeParse({
      displayName: form.get("displayName"),
      professionalRoles: selectedRoles,
      gradeLevel: form.get("gradeLevel"),
      subjects: selectedSubjects,
      languages: selectedLanguages,
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
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      setError(
        parsed.error.issues[0]?.message ?? "Review your profile details.",
      );
      return;
    }

    if (pending) return;
    setPending(true);
    try {
      await requestJson("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      toast.success("Profile updated.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save your profile.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <ProfilePhotoEditor
        initialPhotoURL={initialPhotoURL}
        displayName={initial.displayName}
      />
      <ProfileCoverEditor initialCoverTheme={initialCoverTheme} plan={plan} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Display name"
          id="displayName"
          error={fieldErrors.displayName}
        >
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initial.displayName}
            required
          />
        </Field>
        <ChoiceFieldset
          legend="Your role"
          error={fieldErrors.professionalRoles}
          hint="Choose up to four roles. Select the one that best describes your current work first."
        >
          {[
            ...new Set([...professionalRoles, ...initial.professionalRoles]),
          ].map((role) => (
            <Choice
              key={role}
              label={role}
              checked={selectedRoles.includes(role)}
              disabled={
                !selectedRoles.includes(role) && selectedRoles.length >= 4
              }
              onChange={() =>
                setSelectedRoles((current) =>
                  current.includes(role)
                    ? current.filter((value) => value !== role)
                    : [...current, role],
                )
              }
            />
          ))}
        </ChoiceFieldset>
        <Field
          label="Education stage"
          id="gradeLevel"
          error={fieldErrors.gradeLevel}
          hint="Grade ranges are approximate and vary by country."
        >
          <select
            id="gradeLevel"
            name="gradeLevel"
            defaultValue={initial.gradeLevel}
            className="border-accent bg-input/60 h-11 w-full rounded-md border px-3 text-sm shadow-sm"
            required
          >
            {!educationStages.some(
              ({ value }) => value === initial.gradeLevel,
            ) && (
              <option value={initial.gradeLevel}>{initial.gradeLevel}</option>
            )}
            {educationStages.map(({ value, label, guidance }) => (
              <option key={value} value={value}>
                {label} ({guidance})
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-6 sm:col-span-2">
          <ChoiceFieldset
            legend="Subjects and areas of expertise"
            error={fieldErrors.subjects}
            hint="Choose up to six. Leadership and whole-school expertise belong here too."
          >
            {subjectAreas.map((subject) => {
              const checked = selectedSubjects.includes(subject);
              return (
                <Choice
                  key={subject}
                  label={subject}
                  checked={checked}
                  disabled={!checked && selectedSubjects.length >= 6}
                  onChange={() => toggleSubject(subject)}
                />
              );
            })}
          </ChoiceFieldset>
          {selectedSubjects.includes("Languages") && (
            <ChoiceFieldset
              legend="Languages you teach"
              error={fieldErrors.languages}
              hint="Choose every language that applies."
            >
              {taughtLanguages.map((language) => {
                const checked = selectedLanguages.includes(language);
                return (
                  <Choice
                    key={language}
                    label={language}
                    checked={checked}
                    disabled={!checked && selectedLanguages.length >= 8}
                    onChange={() => toggleLanguage(language)}
                  />
                );
              })}
            </ChoiceFieldset>
          )}
        </div>
        <Field
          label="Years of experience"
          id="yearsOfExperience"
          error={fieldErrors.yearsOfExperience}
        >
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
        <Field
          label="School or organization"
          id="school"
          error={fieldErrors.school}
        >
          <Input id="school" name="school" defaultValue={initial.school} />
        </Field>
        <Field label="Website" id="website" error={fieldErrors.website}>
          <Input
            id="website"
            name="website"
            type="text"
            inputMode="url"
            defaultValue={initial.website ?? ""}
            placeholder="your-school.org"
          />
        </Field>
        <Field label="City" id="city" error={fieldErrors.city}>
          <Input id="city" name="city" defaultValue={initial.city} required />
        </Field>
        <Field label="Country" id="country" error={fieldErrors.country}>
          <Input
            id="country"
            name="country"
            defaultValue={initial.country}
            required
          />
        </Field>
      </div>
      <Field
        label="Professional bio"
        id="bio"
        error={fieldErrors.bio}
        hint="Up to 500 characters."
      >
        <textarea
          id="bio"
          name="bio"
          maxLength={500}
          rows={5}
          defaultValue={initial.bio}
          className="border-accent bg-input/60 w-full resize-y rounded-md border px-3 py-3 text-sm"
        />
      </Field>
      <Field
        label="Professional interests"
        id="interests"
        error={fieldErrors.interests}
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
      <div className="form-actions">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
