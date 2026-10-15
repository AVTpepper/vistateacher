"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormField as Field } from "@/components/ui/form-field";
import { ChoiceFieldset, Choice } from "@/components/ui/choice-field";
import { safeReturnTo } from "@/lib/auth/return-to";
import { planIntentHref, type PlanIntent } from "@/lib/billing/plan-intent";
import {
  educationStages,
  professionalRoles,
  subjectAreas,
  taughtLanguages,
} from "@/lib/profiles/options";
import { onboardingSchema } from "@/schemas/auth";

type OnboardingInput = z.input<typeof onboardingSchema>;
type OnboardingValues = z.output<typeof onboardingSchema>;

export function OnboardingForm({
  displayName,
  planIntent = null,
  returnTo = null,
}: {
  displayName: string;
  planIntent?: PlanIntent | null;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const form = useForm<OnboardingInput, unknown, OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName,
      professionalRoles: [],
      gradeLevel: undefined,
      subjects: [],
      languages: [],
      country: "",
      city: "",
      school: "",
      yearsOfExperience: null,
      bio: "",
      interests: [],
    },
  });
  const selectedSubjects =
    useWatch({ control: form.control, name: "subjects" }) ?? [];
  const selectedRoles =
    useWatch({ control: form.control, name: "professionalRoles" }) ?? [];
  const selectedLanguages =
    useWatch({ control: form.control, name: "languages" }) ?? [];

  function toggleSubject(subject: (typeof subjectAreas)[number]) {
    const next = selectedSubjects.includes(subject)
      ? selectedSubjects.filter((value) => value !== subject)
      : [...selectedSubjects, subject];
    if (subject === "Languages" && selectedSubjects.includes(subject)) {
      form.setValue("languages", [], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    form.setValue("subjects", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function toggleLanguage(language: (typeof taughtLanguages)[number]) {
    const next = selectedLanguages.includes(language)
      ? selectedLanguages.filter((value) => value !== language)
      : [...selectedLanguages, language];
    form.setValue("languages", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function submit(values: OnboardingValues) {
    form.clearErrors("root");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        next?: string;
      } | null;
      if (!response.ok || !result?.next) {
        form.setError("root", {
          message: result?.error ?? "We couldn't save your profile.",
        });
        return;
      }
      router.push(
        safeReturnTo(returnTo) ??
          (planIntent
            ? planIntentHref("/settings/billing", planIntent)
            : result.next),
      );
      router.refresh();
    } catch {
      form.setError("root", {
        message:
          "We couldn't save your profile. Check your connection and try again.",
      });
    }
  }

  return (
    <form className="space-y-9" onSubmit={form.handleSubmit(submit)} noValidate>
      <fieldset
        disabled={form.formState.isSubmitting}
        className="min-w-0 space-y-9"
      >
        <section aria-labelledby="professional-details" className="space-y-5">
          <div>
            <h2
              tabIndex={-1}
              id="professional-details"
              className="mt-2 font-serif text-2xl"
            >
              Your professional context
            </h2>
          </div>
          <Field
            id="primary-role"
            label="Primary role"
            error={form.formState.errors.professionalRoles?.message}
            hint="You can add more roles later in profile settings."
          >
            <Select
              id="primary-role"
              value={selectedRoles[0] ?? ""}
              onChange={(event) =>
                form.setValue(
                  "professionalRoles",
                  [event.target.value as (typeof professionalRoles)[number]],
                  { shouldDirty: true, shouldValidate: true },
                )
              }
            >
              <option value="" disabled>
                Choose your role
              </option>
              {professionalRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Full name"
              id="displayName"
              error={form.formState.errors.displayName?.message}
            >
              <Input
                id="displayName"
                autoComplete="name"
                {...form.register("displayName")}
              />
            </Field>
            <Field
              label="Education stage"
              id="gradeLevel"
              error={form.formState.errors.gradeLevel?.message}
              hint="Grade ranges are approximate and vary by country."
            >
              <select
                id="gradeLevel"
                className="border-accent bg-input/60 h-11 w-full rounded-md border px-3 text-sm"
                {...form.register("gradeLevel")}
              >
                <option value="" disabled>
                  Choose your education stage
                </option>
                {educationStages.map(({ value, label, guidance }) => (
                  <option key={value} value={value}>
                    {label} ({guidance})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section aria-labelledby="teaching-interests" className="space-y-5">
          <div>
            <h2
              tabIndex={-1}
              id="teaching-interests"
              className="mt-2 font-serif text-2xl"
            >
              Subjects and expertise
            </h2>
          </div>
          <Field
            id="primary-subject"
            label="Main subject or expertise"
            error={form.formState.errors.subjects?.message}
          >
            <Select
              id="primary-subject"
              value={selectedSubjects[0] ?? ""}
              onChange={(event) => {
                const subject = event.target
                  .value as (typeof subjectAreas)[number];
                const next = [
                  subject,
                  ...selectedSubjects
                    .slice(1)
                    .filter((item) => item !== subject),
                ];
                form.setValue("subjects", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                if (!next.includes("Languages")) form.setValue("languages", []);
              }}
            >
              <option value="" disabled>
                Choose your main subject or expertise
              </option>
              {subjectAreas.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </Select>
          </Field>
          <details className="rounded-lg border p-4">
            <summary className="min-h-6 cursor-pointer text-sm font-semibold">
              Add more subjects (optional)
            </summary>
            <div className="mt-4">
              <ChoiceFieldset
                legend="Additional subjects and expertise"
                hint="Choose up to six. Leadership and whole-school expertise belong here too."
                error={form.formState.errors.subjects?.message}
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
            </div>
          </details>
          {selectedSubjects.includes("Languages") && (
            <ChoiceFieldset
              legend="Languages you teach"
              hint="Choose every language that applies."
              error={form.formState.errors.languages?.message}
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
        </section>

        {form.formState.errors.root?.message && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <p className="text-muted-foreground text-sm leading-6">
          That is all you need to get started. Add your location, organization,
          experience, and bio later in profile settings.
        </p>
        <div className="form-actions">
          <Button
            className="w-full sm:w-auto"
            size="lg"
            disabled={form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <ArrowRight aria-hidden="true" />
            )}
            Get started
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
