"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { DraftStatus } from "@/components/ui/draft-status";
import { useRecoveredDraft } from "@/lib/creation-drafts/use-recovered-draft";
import {
  WORKSHEET_QUESTION_TYPES,
  WORKSHEET_QUESTION_LABELS,
  worksheetSourceSchema,
  type WorksheetSourceInput,
  type WorksheetQuestionType,
} from "@/schemas/worksheet";
import type {
  WorksheetDetail,
  WorksheetWorkspace,
} from "@/lib/worksheets/server";
import { EMPTY_WORKSHEET_SOURCE } from "./defaults";
import { balanceQuestionCounts } from "@/lib/worksheets/question-mix";

export function WorksheetCreate({
  uid,
  initialSource,
  referenceTitle,
  usage,
  sampleMode,
}: {
  uid: string;
  initialSource?: WorksheetSourceInput;
  referenceTitle?: string;
  usage: WorksheetWorkspace["usage"];
  sampleMode: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const recovery = useRecoveredDraft(
    `worksheet-create:${uid}:${initialSource?.sourceLessonId ?? "new"}`,
    {
      source: initialSource ?? EMPTY_WORKSHEET_SOURCE,
      selectedTypes: [...WORKSHEET_QUESTION_TYPES] as WorksheetQuestionType[],
      questionTotal: 12,
    },
  );
  const { selectedTypes, questionTotal } = recovery.value;
  const source = {
    ...recovery.value.source,
    questionCounts: balanceQuestionCounts(questionTotal, selectedTypes),
  };
  const set = (patch: Partial<WorksheetSourceInput>) =>
    recovery.setValue((current) => ({
      ...current,
      source: { ...current.source, ...patch },
    }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (
      !selectedTypes.length ||
      !Number.isInteger(questionTotal) ||
      questionTotal < selectedTypes.length ||
      questionTotal > 30
    ) {
      setErrors({
        questionCounts: !selectedTypes.length
          ? "Select at least one question type."
          : `Choose a whole number from ${selectedTypes.length} to 30 so every selected type is included.`,
      });
      return;
    }
    const parsed = worksheetSourceSchema.safeParse(source);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0], issue.message]),
        ),
      );
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
    setErrors({});
    setPending(true);
    const fingerprint = JSON.stringify(parsed.data);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: parsed.data,
          requestId: request.current!.id,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status !== 409) request.current = null;
        throw new Error(body.error ?? "Generation failed. Try again.");
      }
      const worksheet = body as WorksheetDetail;
      recovery.clear();
      router.push(`/worksheets/${worksheet.id}`);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not generate. Try again.",
      );
      setPending(false);
    }
  }
  const textField = (
    key: "subject" | "gradeLevel" | "topic" | "language" | "curriculum",
    label: string,
    placeholder: string,
    required = false,
  ) => (
    <FormField
      id={`${id}-${key}`}
      label={label}
      required={required}
      error={errors[key]}
    >
      <Input
        id={`${id}-${key}`}
        value={source[key] ?? ""}
        onChange={(event) => set({ [key]: event.target.value })}
        maxLength={key === "topic" ? 240 : key === "curriculum" ? 500 : 80}
        placeholder={placeholder}
        required={required}
      />
    </FormField>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/worksheets">
          <ArrowLeft />
          Worksheets
        </Link>
      </Button>
      <div>
        <h1 className="font-serif text-3xl">Create worksheet</h1>
        <p className="text-muted-foreground mt-2">
          Choose your question types and total. AI balances the mix; you can
          edit questions and the separate answer key before printing.
        </p>
      </div>
      {sampleMode && (
        <p role="note" className="bg-secondary rounded-xl p-4 text-sm">
          Sample mode: generates demonstration content without calling OpenAI.
          Review the workflow here; subject-specific AI content requires the
          configured live provider.
        </p>
      )}
      {referenceTitle && (
        <p className="surface-card p-4 text-sm">
          Based on your lesson: <strong>{referenceTitle}</strong>. Its saved
          version will be kept as a reference.
        </p>
      )}
      <form
        ref={form}
        onSubmit={(event) => void generate(event)}
        onChange={() => {
          if (Object.keys(errors).length) setErrors({});
          if (error) setError("");
        }}
        noValidate
        className="surface-card space-y-6 p-4 sm:p-6"
        aria-busy={pending}
      >
        <fieldset disabled={pending} className="space-y-5">
          <legend className="sr-only">Worksheet brief</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {textField("subject", "Subject", "Any school subject", true)}
            {textField(
              "gradeLevel",
              "Grade level / age group",
              "For example, Grade 5 or ages 10–11",
              true,
            )}
          </div>
          {textField("topic", "Topic", "What should students practice?", true)}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id={`${id}-difficulty`} label="Difficulty">
              <Select
                id={`${id}-difficulty`}
                value={source.difficulty}
                onChange={(event) =>
                  set({
                    difficulty: event.target
                      .value as WorksheetSourceInput["difficulty"],
                  })
                }
              >
                <option value="foundation">Foundation — guided practice</option>
                <option value="core">Core — expected level</option>
                <option value="challenge">Challenge — deeper thinking</option>
                <option value="mixed">Mixed — balanced range</option>
              </Select>
            </FormField>
            {textField("language", "Content language", "English")}
          </div>
          <fieldset
            className="space-y-2"
            aria-describedby={`${id}-counts-help`}
          >
            <legend className="mb-2 font-bold">Question types</legend>
            <p
              id={`${id}-counts-help`}
              className="text-muted-foreground text-sm"
            >
              Select the types you want. The total is spread as evenly as
              possible across them.
            </p>
            {WORKSHEET_QUESTION_TYPES.map((type) => (
              <label
                key={type}
                htmlFor={`${id}-${type}`}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b py-2 text-sm font-semibold"
              >
                <span className="flex items-center gap-3">
                  <input
                    id={`${id}-${type}`}
                    type="checkbox"
                    className="accent-primary size-5"
                    checked={selectedTypes.includes(type)}
                    onChange={(event) =>
                      recovery.setValue((current) => ({
                        ...current,
                        selectedTypes: event.target.checked
                          ? [...current.selectedTypes, type]
                          : current.selectedTypes.filter(
                              (item) => item !== type,
                            ),
                      }))
                    }
                  />
                  {WORKSHEET_QUESTION_LABELS[type]}
                </span>
                <span className="text-muted-foreground font-normal">
                  {source.questionCounts[type]}
                </span>
              </label>
            ))}
            <FormField
              id={`${id}-total`}
              label="Total questions"
              error={errors.questionCounts}
              hint={`Choose ${Math.max(1, selectedTypes.length)}–30 questions so every selected type is included.`}
            >
              <Input
                id={`${id}-total`}
                type="number"
                min={Math.max(1, selectedTypes.length)}
                max={30}
                step={1}
                inputMode="numeric"
                value={questionTotal}
                onChange={(event) =>
                  recovery.setValue((current) => ({
                    ...current,
                    questionTotal:
                      event.target.value === ""
                        ? 0
                        : Number(event.target.value),
                  }))
                }
              />
            </FormField>
            <p className="text-sm font-bold" aria-live="polite">
              Planned mix: {questionTotal}{" "}
              {questionTotal === 1 ? "question" : "questions"} across{" "}
              {selectedTypes.length}{" "}
              {selectedTypes.length === 1 ? "type" : "types"}
            </p>
          </fieldset>
          <details className="rounded-xl border p-4">
            <summary className="min-h-11 cursor-pointer py-3 font-bold">
              Optional teaching context
            </summary>
            <div className="mt-4 space-y-4">
              {textField(
                "curriculum",
                "Curriculum / country",
                "For example, Common Core, England or Lgr22",
              )}
              <FormField
                id={`${id}-classSize`}
                label="Class size"
                error={errors.classSize}
              >
                <Input
                  id={`${id}-classSize`}
                  type="number"
                  min={1}
                  max={200}
                  value={source.classSize ?? ""}
                  onChange={(event) =>
                    set({
                      classSize: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
              </FormField>
              {(
                [
                  ["objectives", "Learning objectives", 2000],
                  ["standards", "Standards to follow", 1000],
                  ["studentNeeds", "Student needs and accessibility", 2000],
                  ["availableMaterials", "Available materials", 1000],
                  ["additionalInstructions", "Additional instructions", 2000],
                ] as const
              ).map(([key, label, maxLength]) => (
                <FormField
                  key={key}
                  id={`${id}-${key}`}
                  label={label}
                  error={errors[key]}
                >
                  <Textarea
                    id={`${id}-${key}`}
                    rows={3}
                    value={source[key] ?? ""}
                    maxLength={maxLength}
                    onChange={(event) => set({ [key]: event.target.value })}
                  />
                </FormField>
              ))}
            </div>
          </details>
        </fieldset>
        <DraftStatus status={recovery.status} restored={recovery.restored} />
        <div className="space-y-3 border-t pt-5">
          <p className="text-muted-foreground text-sm">
            Uses 1 AI action. {usage.remaining} of {usage.limit} left this
            month, shared with lessons. Editing and downloads are free.
          </p>
          {usage.remaining === 0 && (
            <p className="text-sm">
              Your allowance resets{" "}
              {new Date(usage.resetsAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
              .{" "}
              <Link className="text-primary underline" href="/settings/billing">
                View your plan
              </Link>
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending || usage.remaining < 1}
            className="w-full sm:w-auto"
          >
            {pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {pending ? "Generating worksheet…" : "Generate worksheet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
