"use client";

import { LoaderCircle, Save, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DraftStatus } from "@/components/ui/draft-status";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRecoveredDraft } from "@/lib/creation-drafts/use-recovered-draft";
import { lessonPlanSchema, type LessonPlanInput } from "@/schemas/lesson";

interface LessonEditorProps {
  recoveryKey: string;
  currentVersion: number;
  content: LessonPlanInput;
  visibility: "draft" | "published";
  saving: boolean;
  canRefine: boolean;
  onCancel: () => void;
  onSave: (
    content: LessonPlanInput,
    visibility: "draft" | "published",
  ) => Promise<boolean>;
  onRefine: (
    feedback: string,
    referenceContent: LessonPlanInput,
  ) => Promise<boolean>;
}

const nonemptyLines = (items: string[]) =>
  items.map((item) => item.trim()).filter(Boolean);

export function LessonEditor({
  recoveryKey,
  currentVersion,
  content,
  visibility,
  saving,
  canRefine,
  onCancel,
  onSave,
  onRefine,
}: LessonEditorProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const recovery = useRecoveredDraft(recoveryKey, {
    content,
    visibility,
    feedback: "",
    baseVersion: currentVersion,
  });
  const {
    content: draft,
    visibility: draftVisibility,
    feedback,
  } = recovery.value;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const setDraft = (content: LessonPlanInput) =>
    recovery.setValue((current) => ({ ...current, content }));
  const errorFor = (name: string) =>
    Object.entries(errors).find(
      ([path]) => path === name || path.startsWith(`${name}.`),
    )?.[1];

  function validatedContent() {
    const parsed = lessonPlanSchema.safeParse({
      ...draft,
      objectives: nonemptyLines(draft.objectives),
      materials: nonemptyLines(draft.materials),
      standards: nonemptyLines(draft.standards),
      mainActivity: {
        ...draft.mainActivity,
        steps: nonemptyLines(draft.mainActivity.steps),
      },
      differentiation: {
        supports: nonemptyLines(draft.differentiation.supports),
        extensions: nonemptyLines(draft.differentiation.extensions),
      },
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      setSaveError("Review the highlighted lesson fields before continuing.");
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return null;
    }
    setErrors({});
    setSaveError(null);
    return parsed.data;
  }

  async function save() {
    if (saving) return;
    const next = validatedContent();
    if (!next) return;
    try {
      if (await onSave(next, draftVisibility)) recovery.clear();
      else
        setSaveError(
          "Your changes could not be saved. Your unfinished edit is still available here.",
        );
    } catch {
      setSaveError(
        "Your changes could not be saved. Check your connection and try again.",
      );
    }
  }

  const textField = (
    name: string,
    label: string,
    value: string,
    update: (value: string) => void,
    rows = 3,
  ) => (
    <FormField id={`${id}-${name}`} label={label} error={errorFor(name)}>
      {rows === 2 ? (
        <Input
          id={`${id}-${name}`}
          value={value}
          onChange={(event) => update(event.target.value)}
        />
      ) : (
        <Textarea
          id={`${id}-${name}`}
          value={value}
          onChange={(event) => update(event.target.value)}
          rows={rows}
        />
      )}
    </FormField>
  );
  const listField = (
    name: string,
    label: string,
    value: string[],
    update: (value: string[]) => void,
  ) => (
    <FormField
      id={`${id}-${name}`}
      label={label}
      hint="One item per line."
      error={errorFor(name)}
    >
      <Textarea
        id={`${id}-${name}`}
        value={value.join("\n")}
        onChange={(event) => update(event.target.value.split("\n"))}
        rows={4}
      />
    </FormField>
  );

  return (
    <form
      ref={formRef}
      aria-label="Lesson editor"
      aria-busy={saving}
      className="surface-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
    >
      <fieldset disabled={saving} className="min-w-0">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl">Edit lesson</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Your previous versions are kept. Recovery drafts stay private
              until you save.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close editor"
            onClick={onCancel}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="mb-4">
          <DraftStatus status={recovery.status} restored={recovery.restored} />
        </div>
        {recovery.restored && recovery.value.baseVersion !== currentVersion && (
          <p role="alert" className="text-amber mb-4 text-sm">
            This unfinished edit is based on an older version. Review it before
            saving.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField id={`${id}-visibility`} label="Lesson status">
              <Select
                id={`${id}-visibility`}
                value={draftVisibility}
                onChange={(event) =>
                  recovery.setValue((current) => ({
                    ...current,
                    visibility: event.target.value as "draft" | "published",
                  }))
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </FormField>
          </div>
          {textField(
            "title",
            "Title",
            draft.title,
            (title) => setDraft({ ...draft, title }),
            2,
          )}
          {textField(
            "subject",
            "Subject",
            draft.subject,
            (subject) => setDraft({ ...draft, subject }),
            2,
          )}
          {textField(
            "gradeLevel",
            "Grade level",
            draft.gradeLevel,
            (gradeLevel) => setDraft({ ...draft, gradeLevel }),
            2,
          )}
          <FormField
            id={`${id}-duration`}
            label="Duration (minutes)"
            error={errorFor("durationMinutes")}
          >
            <Input
              id={`${id}-duration`}
              type="number"
              min={15}
              max={240}
              value={draft.durationMinutes}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  durationMinutes: Number(event.target.value),
                })
              }
            />
          </FormField>
          {listField(
            "objectives",
            "Objectives (one per line)",
            draft.objectives,
            (objectives) => setDraft({ ...draft, objectives }),
          )}
          {listField(
            "materials",
            "Materials (one per line)",
            draft.materials,
            (materials) => setDraft({ ...draft, materials }),
          )}
          {textField(
            "warmUp.activity",
            "Warm-up",
            draft.warmUp.activity,
            (activity) =>
              setDraft({ ...draft, warmUp: { ...draft.warmUp, activity } }),
          )}
          {textField(
            "mainActivity.description",
            "Main activity",
            draft.mainActivity.description,
            (description) =>
              setDraft({
                ...draft,
                mainActivity: { ...draft.mainActivity, description },
              }),
          )}
          <div className="sm:col-span-2">
            {listField(
              "mainActivity.steps",
              "Main activity steps (one per line)",
              draft.mainActivity.steps,
              (steps) =>
                setDraft({
                  ...draft,
                  mainActivity: { ...draft.mainActivity, steps },
                }),
            )}
          </div>
          {textField(
            "closingActivity.activity",
            "Closing activity",
            draft.closingActivity.activity,
            (activity) =>
              setDraft({
                ...draft,
                closingActivity: { ...draft.closingActivity, activity },
              }),
          )}
          {textField(
            "assessment",
            "Assessment",
            draft.assessment,
            (assessment) => setDraft({ ...draft, assessment }),
          )}
          {listField(
            "differentiation.supports",
            "Supports (one per line)",
            draft.differentiation.supports,
            (supports) =>
              setDraft({
                ...draft,
                differentiation: { ...draft.differentiation, supports },
              }),
          )}
          {listField(
            "differentiation.extensions",
            "Extensions (one per line)",
            draft.differentiation.extensions,
            (extensions) =>
              setDraft({
                ...draft,
                differentiation: { ...draft.differentiation, extensions },
              }),
          )}
          <div className="sm:col-span-2">
            {listField(
              "standards",
              "Standards (one per line)",
              draft.standards,
              (standards) => setDraft({ ...draft, standards }),
            )}
          </div>
        </div>
        <div className="mt-5">
          <FormField
            id={`${id}-feedback`}
            label="AI feedback for fresh regeneration"
            hint="Regeneration uses one AI refinement from your monthly allowance."
          >
            <Textarea
              id={`${id}-feedback`}
              value={feedback}
              maxLength={2000}
              rows={3}
              onChange={(event) =>
                recovery.setValue((current) => ({
                  ...current,
                  feedback: event.target.value,
                }))
              }
              placeholder="Describe what you would like to improve..."
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={!canRefine || feedback.trim().length < 3}
            onClick={async () => {
              const next = validatedContent();
              if (!next) return;
              try {
                if (await onRefine(feedback, next)) recovery.clear();
              } catch {
                setSaveError(
                  "Regeneration failed. Your unfinished edit is still available.",
                );
              }
            }}
          >
            Regenerate With AI Feedback
          </Button>
        </div>
        {saveError && (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {saveError}
          </p>
        )}
        <div className="form-actions mt-5">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Close
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              recovery.setValue({
                content,
                visibility,
                feedback: "",
                baseVersion: currentVersion,
              });
              recovery.clear();
              setErrors({});
              setSaveError(null);
            }}
          >
            Discard edit
          </Button>
          <Button type="submit">
            {saving ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save version
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
