"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
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
  const [step, setStep] = useState<1 | 2>(1);
  async function nextStep() {
    if (
      await form.trigger(
        [
          "professionalRoles",
          "displayName",
          "gradeLevel",
          "country",
          "city",
          "school",
          "yearsOfExperience",
        ],
        { shouldFocus: true },
      )
    ) {
      setStep(2);
      requestAnimationFrame(() =>
        document.getElementById("teaching-interests")?.focus(),
      );
    }
  }
  const form = useForm<OnboardingInput, unknown, OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName,
      professionalRoles: [],
      gradeLevel: "Primary / Elementary School",
      subjects: [],
      languages: [],
      country: "",
      city: "",
      school: "",
      yearsOfExperience: 0,
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

  function toggleRole(role: (typeof professionalRoles)[number]) {
    const next = selectedRoles.includes(role)
      ? selectedRoles.filter((value) => value !== role)
      : [...selectedRoles, role];
    form.setValue("professionalRoles", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

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
    <form
      className="space-y-9"
      onSubmit={(event) => {
        if (step === 1) {
          event.preventDefault();
          void nextStep();
        } else void form.handleSubmit(submit)(event);
      }}
      noValidate
    >
      <section
        hidden={step !== 1}
        aria-labelledby="professional-details"
        className="space-y-5"
      >
        <div>
          <p className="text-primary font-mono text-xs font-bold uppercase">
            Step 1 of 2
          </p>
          <h2
            tabIndex={-1}
            id="professional-details"
            className="mt-2 font-serif text-2xl"
          >
            Your professional context
          </h2>
        </div>
        <ChoiceFieldset
          legend="Your role"
          hint="Choose up to four roles. Select the one that best describes your current work first."
          error={form.formState.errors.professionalRoles?.message}
        >
          {professionalRoles.map((role) => {
            const checked = selectedRoles.includes(role);
            return (
              <Choice
                key={role}
                label={role}
                checked={checked}
                disabled={!checked && selectedRoles.length >= 4}
                onChange={() => toggleRole(role)}
              />
            );
          })}
        </ChoiceFieldset>
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
              {educationStages.map(({ value, label, guidance }) => (
                <option key={value} value={value}>
                  {label} ({guidance})
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Country"
            id="country"
            error={form.formState.errors.country?.message}
          >
            <Input
              id="country"
              autoComplete="country-name"
              {...form.register("country")}
            />
          </Field>
          <Field
            label="City"
            id="city"
            error={form.formState.errors.city?.message}
          >
            <Input
              id="city"
              autoComplete="address-level2"
              {...form.register("city")}
            />
          </Field>
          <Field
            label="School or organization"
            id="school"
            error={form.formState.errors.school?.message}
          >
            <Input
              id="school"
              autoComplete="organization"
              {...form.register("school")}
            />
          </Field>
          <Field
            label="Years of experience"
            id="yearsOfExperience"
            error={form.formState.errors.yearsOfExperience?.message}
          >
            <Input
              id="yearsOfExperience"
              type="number"
              min={0}
              max={60}
              {...form.register("yearsOfExperience", { valueAsNumber: true })}
            />
          </Field>
        </div>
      </section>

      <section
        hidden={step !== 2}
        aria-labelledby="teaching-interests"
        className="space-y-5"
      >
        <div>
          <p className="text-accent-readable font-mono text-xs font-bold uppercase">
            Step 2 of 2
          </p>
          <h2
            tabIndex={-1}
            id="teaching-interests"
            className="mt-2 font-serif text-2xl"
          >
            Subjects and expertise
          </h2>
        </div>
        <ChoiceFieldset
          legend="Subjects and areas of expertise"
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
        <Field
          label="Short professional bio"
          id="bio"
          error={form.formState.errors.bio?.message}
        >
          <textarea
            id="bio"
            rows={4}
            className="border-accent bg-input/60 w-full resize-y rounded-md border px-3 py-3 text-sm"
            placeholder="Share your teaching focus and what you hope to exchange with other educators."
            {...form.register("bio")}
          />
        </Field>
      </section>

      {form.formState.errors.root?.message && (
        <p className="text-destructive text-sm" role="alert">
          {form.formState.errors.root.message}
        </p>
      )}
      <div className="form-actions">
        {step === 2 && (
          <Button
            type="button"
            variant="outline"
            disabled={form.formState.isSubmitting}
            onClick={() => {
              setStep(1);
              requestAnimationFrame(() =>
                document.getElementById("professional-details")?.focus(),
              );
            }}
          >
            Back
          </Button>
        )}
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
          {step === 1 ? "Next: subjects and expertise" : "Complete profile"}
        </Button>
      </div>
    </form>
  );
}
