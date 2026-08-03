"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { onboardingSchema } from "@/schemas/auth";

type OnboardingInput = z.input<typeof onboardingSchema>;
type OnboardingValues = z.output<typeof onboardingSchema>;

const subjects = [
  "Arts",
  "Early Childhood",
  "English Language Arts",
  "Languages",
  "Mathematics",
  "Physical Education",
  "Science",
  "Social Studies",
  "Special Education",
  "Technology",
];

const gradeLevels = [
  "Early Childhood",
  "Elementary",
  "Middle School",
  "High School",
  "Higher Education",
  "All Grades",
] as const;

export function OnboardingForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const form = useForm<OnboardingInput, unknown, OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName,
      gradeLevel: "Elementary",
      subjects: [],
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

  function toggleSubject(subject: string) {
    const next = selectedSubjects.includes(subject)
      ? selectedSubjects.filter((value) => value !== subject)
      : [...selectedSubjects, subject];
    form.setValue("subjects", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function submit(values: OnboardingValues) {
    form.clearErrors("root");
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = (await response.json()) as { error?: string; next?: string };
    if (!response.ok || !result.next) {
      form.setError("root", {
        message: result.error ?? "We couldn't save your profile.",
      });
      return;
    }
    router.push(result.next);
    router.refresh();
  }

  return (
    <form className="space-y-9" onSubmit={form.handleSubmit(submit)} noValidate>
      <section aria-labelledby="professional-details" className="space-y-5">
        <div>
          <p className="text-primary font-mono text-xs font-bold uppercase">
            Step 1 of 2
          </p>
          <h2 id="professional-details" className="mt-2 font-serif text-2xl">
            Your teaching context
          </h2>
        </div>
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
            label="Grade level"
            id="gradeLevel"
            error={form.formState.errors.gradeLevel?.message}
          >
            <select
              id="gradeLevel"
              className="border-input bg-input/60 h-11 w-full rounded-md border px-3 text-sm"
              {...form.register("gradeLevel")}
            >
              {gradeLevels.map((level) => (
                <option key={level}>{level}</option>
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
        aria-labelledby="teaching-interests"
        className="space-y-5 border-t pt-8"
      >
        <div>
          <p className="text-accent font-mono text-xs font-bold uppercase">
            Step 2 of 2
          </p>
          <h2 id="teaching-interests" className="mt-2 font-serif text-2xl">
            Subjects and perspective
          </h2>
        </div>
        <fieldset>
          <legend className="text-sm font-bold">Subjects you teach</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {subjects.map((subject) => {
              const checked = selectedSubjects.includes(subject);
              return (
                <label
                  key={subject}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm font-semibold",
                    checked &&
                      "border-primary bg-secondary text-secondary-foreground",
                  )}
                >
                  <input
                    className="accent-primary size-4"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSubject(subject)}
                  />
                  {subject}
                </label>
              );
            })}
          </div>
          {form.formState.errors.subjects?.message && (
            <p className="text-destructive mt-2 text-xs" role="alert">
              {form.formState.errors.subjects.message}
            </p>
          )}
        </fieldset>
        <Field
          label="Short professional bio"
          id="bio"
          error={form.formState.errors.bio?.message}
        >
          <textarea
            id="bio"
            rows={4}
            className="border-input bg-input/60 w-full resize-y rounded-md border px-3 py-3 text-sm"
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
        Complete profile
      </Button>
    </form>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
