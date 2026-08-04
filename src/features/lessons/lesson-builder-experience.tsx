"use client";

import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Lock,
  Pencil,
  RotateCw,
  Save,
  Sparkles,
  Star,
  Target,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import type {
  LessonDetail,
  LessonSummary,
  LessonWorkspace,
} from "@/lib/lessons/server";
import type { LessonPlanInput, LessonSourceInput } from "@/schemas/lesson";

const SUBJECTS = [
  "Mathematics",
  "English Language Arts",
  "Science",
  "Social Studies",
  "Special Education",
  "Art",
  "Physical Education",
  "Computer Science",
];
const GRADES = [
  "Kindergarten",
  ...Array.from(
    { length: 12 },
    (_, index) => `${index + 1}${["st", "nd", "rd"][index] ?? "th"} Grade`,
  ),
];

const EMPTY_SOURCE: LessonSourceInput = {
  subject: "Mathematics",
  gradeLevel: "5th Grade",
  topic: "",
  durationMinutes: 60,
  objectives: "",
  standards: "",
  studentNeeds: "",
  teachingStyle: "balanced",
};

function asSummary(lesson: LessonDetail): LessonSummary {
  return {
    id: lesson.id,
    title: lesson.title,
    subject: lesson.subject,
    gradeLevel: lesson.gradeLevel,
    durationMinutes: lesson.durationMinutes,
    currentVersion: lesson.currentVersion,
    generationStatus: lesson.generationStatus,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resultJson<T>(response: Response): Promise<T> {
  const result = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok)
    throw new Error(result?.error ?? "The request could not be completed.");
  return result as T;
}

function PlusGate() {
  return (
    <div className="mx-auto max-w-2xl py-14 text-center sm:py-20">
      <div className="bg-accent/10 mx-auto mb-6 grid size-20 place-items-center rounded-2xl">
        <Lock aria-hidden="true" className="text-accent size-9" />
      </div>
      <h1 className="font-serif text-3xl">AI Lesson Builder</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-6">
        Complete lesson plans with standards, differentiation, assessments, and
        classroom-ready exports.
      </p>
      <div className="mx-auto mt-7 grid max-w-lg gap-3 text-left text-sm sm:grid-cols-2">
        {[
          "50 lesson plans each month",
          "Structured version history",
          "Built-in differentiation",
          "PDF and DOCX exports",
        ].map((feature) => (
          <span key={feature} className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="text-accent size-4" />
            {feature}
          </span>
        ))}
      </div>
      <Link
        href="/pricing"
        className="bg-accent text-accent-foreground mt-8 inline-flex h-11 items-center gap-2 rounded-lg px-6 text-sm font-bold"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        Upgrade to Plus
      </Link>
    </div>
  );
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold">
      {label}
      <textarea
        value={value.join("\n")}
        onChange={(event) => onChange(lines(event.target.value))}
        rows={4}
        className="bg-muted min-h-24 resize-y rounded-lg px-3 py-2 text-sm font-normal outline-none"
      />
    </label>
  );
}

function LessonEditor({
  content,
  saving,
  onCancel,
  onSave,
}: {
  content: LessonPlanInput;
  saving: boolean;
  onCancel: () => void;
  onSave: (content: LessonPlanInput) => void;
}) {
  const [draft, setDraft] = useState(content);
  const textField = (
    label: string,
    value: string,
    update: (value: string) => void,
    rows = 2,
  ) => (
    <label className="grid gap-1.5 text-xs font-bold">
      {label}
      <textarea
        value={value}
        onChange={(event) => update(event.target.value)}
        rows={rows}
        className="bg-muted resize-y rounded-lg px-3 py-2 text-sm font-normal outline-none"
      />
    </label>
  );
  return (
    <div className="bg-card rounded-xl border p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl">Edit lesson</h2>
          <p className="text-muted-foreground text-xs">
            Saving creates a new immutable version.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="hover:bg-muted grid size-9 place-items-center rounded-lg"
          aria-label="Close editor"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("Title", draft.title, (title) =>
          setDraft({ ...draft, title }),
        )}
        {textField("Subject", draft.subject, (subject) =>
          setDraft({ ...draft, subject }),
        )}
        {textField("Grade level", draft.gradeLevel, (gradeLevel) =>
          setDraft({ ...draft, gradeLevel }),
        )}
        <label className="grid gap-1.5 text-xs font-bold">
          Duration (minutes)
          <input
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
            className="bg-muted h-10 rounded-lg px-3 text-sm font-normal outline-none"
          />
        </label>
        <ListField
          label="Objectives (one per line)"
          value={draft.objectives}
          onChange={(objectives) => setDraft({ ...draft, objectives })}
        />
        <ListField
          label="Materials (one per line)"
          value={draft.materials}
          onChange={(materials) => setDraft({ ...draft, materials })}
        />
        {textField(
          "Warm-up",
          draft.warmUp.activity,
          (activity) =>
            setDraft({ ...draft, warmUp: { ...draft.warmUp, activity } }),
          4,
        )}
        {textField(
          "Main activity",
          draft.mainActivity.description,
          (description) =>
            setDraft({
              ...draft,
              mainActivity: { ...draft.mainActivity, description },
            }),
          4,
        )}
        <div className="sm:col-span-2">
          <ListField
            label="Main activity steps (one per line)"
            value={draft.mainActivity.steps}
            onChange={(steps) =>
              setDraft({
                ...draft,
                mainActivity: { ...draft.mainActivity, steps },
              })
            }
          />
        </div>
        {textField(
          "Closing activity",
          draft.closingActivity.activity,
          (activity) =>
            setDraft({
              ...draft,
              closingActivity: { ...draft.closingActivity, activity },
            }),
          4,
        )}
        {textField(
          "Assessment",
          draft.assessment,
          (assessment) => setDraft({ ...draft, assessment }),
          4,
        )}
        <ListField
          label="Supports (one per line)"
          value={draft.differentiation.supports}
          onChange={(supports) =>
            setDraft({
              ...draft,
              differentiation: { ...draft.differentiation, supports },
            })
          }
        />
        <ListField
          label="Extensions (one per line)"
          value={draft.differentiation.extensions}
          onChange={(extensions) =>
            setDraft({
              ...draft,
              differentiation: { ...draft.differentiation, extensions },
            })
          }
        />
        <div className="sm:col-span-2">
          <ListField
            label="Standards (one per line)"
            value={draft.standards}
            onChange={(standards) => setDraft({ ...draft, standards })}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-lg border px-4 text-sm font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(draft)}
          className="bg-primary text-primary-foreground flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
        >
          {saving ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" className="size-4" />
          )}
          Save version
        </button>
      </div>
    </div>
  );
}

function LessonDisplay({
  lesson,
  working,
  onEdit,
  onRegenerate,
  onDuplicate,
}: {
  lesson: LessonDetail;
  working: boolean;
  onEdit: () => void;
  onRegenerate: () => void;
  onDuplicate: () => void;
}) {
  const [expanded, setExpanded] = useState("objectives");
  const content = lesson.content;
  const sections = [
    {
      key: "objectives",
      label: "Learning Objectives",
      icon: Target,
      count: content.objectives.length,
    },
    {
      key: "materials",
      label: "Materials",
      icon: BookOpen,
      count: content.materials.length,
    },
    {
      key: "warmup",
      label: "Warm-Up",
      icon: Lightbulb,
      badge: `${content.warmUp.durationMinutes} min`,
    },
    {
      key: "main",
      label: "Main Activity",
      icon: Brain,
      badge: `${content.mainActivity.durationMinutes} min`,
    },
    {
      key: "closing",
      label: "Closing Activity",
      icon: Star,
      badge: `${content.closingActivity.durationMinutes} min`,
    },
    { key: "assessment", label: "Assessment Strategy", icon: ListChecks },
    {
      key: "diff",
      label: "Differentiation",
      icon: Users,
      count:
        content.differentiation.supports.length +
        content.differentiation.extensions.length,
    },
    {
      key: "standards",
      label: "Standards Alignment",
      icon: FileText,
      count: content.standards.length,
    },
  ];
  const list = (items: string[]) => (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="bg-primary text-primary-foreground mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
  const body = (key: string) => {
    if (key === "objectives") return list(content.objectives);
    if (key === "materials") return list(content.materials);
    if (key === "warmup") return <p>{content.warmUp.activity}</p>;
    if (key === "main")
      return (
        <div className="space-y-4">
          <p>{content.mainActivity.description}</p>
          {list(content.mainActivity.steps)}
        </div>
      );
    if (key === "closing") return <p>{content.closingActivity.activity}</p>;
    if (key === "assessment") return <p>{content.assessment}</p>;
    if (key === "standards")
      return content.standards.length ? (
        <div className="flex flex-wrap gap-2">
          {content.standards.map((standard) => (
            <span
              key={standard}
              className="bg-muted rounded-lg px-3 py-1.5 font-mono text-xs"
            >
              {standard}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No standards specified.</p>
      );
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-primary/5 rounded-lg p-4">
          <p className="text-primary mb-2 text-xs font-bold uppercase">
            Supports
          </p>
          {list(content.differentiation.supports)}
        </div>
        <div className="bg-accent/5 rounded-lg p-4">
          <p className="text-accent mb-2 text-xs font-bold uppercase">
            Extensions
          </p>
          {list(content.differentiation.extensions)}
        </div>
      </div>
    );
  };
  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="bg-primary p-5 text-white sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="font-serif text-2xl leading-tight">
              {content.title}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" />
                {content.subject}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                {content.gradeLevel}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {content.durationMinutes} minutes
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold hover:bg-white/25"
            >
              <Pencil className="size-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              disabled={working}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold hover:bg-white/25 disabled:opacity-50"
            >
              <Copy className="size-3" />
              Duplicate
            </button>
            <a
              href={`/api/ai-lessons/${lesson.id}/export/pdf`}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold hover:bg-white/25"
            >
              <Download className="size-3" />
              PDF
            </a>
            <a
              href={`/api/ai-lessons/${lesson.id}/export/docx`}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-bold hover:bg-white/25"
            >
              <Download className="size-3" />
              DOCX
            </a>
          </div>
        </div>
      </div>
      <div className="divide-y">
        {sections.map((section) => {
          const Icon = section.icon;
          const open = expanded === section.key;
          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => setExpanded(open ? "" : section.key)}
                className="hover:bg-muted/40 flex w-full items-center justify-between p-4 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="bg-primary/10 grid size-8 shrink-0 place-items-center rounded-lg">
                    <Icon className="text-primary size-4" />
                  </span>
                  <span className="truncate text-sm font-bold">
                    {section.label}
                  </span>
                  {section.count !== undefined && (
                    <span className="bg-muted hidden rounded-full px-2 py-0.5 text-[10px] sm:inline">
                      {section.count} items
                    </span>
                  )}
                  {section.badge && (
                    <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[10px]">
                      {section.badge}
                    </span>
                  )}
                </span>
                {open ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              {open && (
                <div className="px-4 pb-5 text-sm leading-6 sm:px-5">
                  {body(section.key)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="bg-muted/35 flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <History className="size-4" />
          Version {lesson.currentVersion} · {lesson.versions.length} saved
          versions
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={working}
          className="border-primary text-primary flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-bold disabled:opacity-50"
        >
          {working ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RotateCw className="size-4" />
          )}
          Regenerate
        </button>
      </div>
    </div>
  );
}

export function LessonBuilderExperience({
  initialWorkspace,
  initialLesson,
}: {
  initialWorkspace: LessonWorkspace;
  initialLesson: LessonDetail | null;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [lesson, setLesson] = useState(initialLesson);
  const [source, setSource] = useState(initialLesson?.source ?? EMPTY_SOURCE);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);

  if (workspace.plan !== "plus") return <PlusGate />;

  async function selectLesson(lessonId: string) {
    if (!lessonId) return setLesson(null);
    setWorking(true);
    try {
      const selected = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lessonId}`),
      );
      setLesson(selected);
      setSource(selected.source);
      setEditing(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Lesson unavailable.",
      );
    } finally {
      setWorking(false);
    }
  }

  function storeLesson(next: LessonDetail, consumesQuota = false) {
    setLesson(next);
    setSource(next.source);
    setWorkspace((current) => ({
      ...current,
      usage: consumesQuota
        ? {
            ...current.usage,
            used: current.usage.used + 1,
            remaining: Math.max(0, current.usage.remaining - 1),
          }
        : current.usage,
      lessons: [
        asSummary(next),
        ...current.lessons.filter((item) => item.id !== next.id),
      ],
    }));
  }

  async function generate() {
    if (source.topic.trim().length < 3)
      return toast.error("Add a topic or unit.");
    setWorking(true);
    try {
      const generated = await resultJson<LessonDetail>(
        await fetch("/api/ai-lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(source),
        }),
      );
      storeLesson(generated, true);
      toast.success("Lesson generated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Generation failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function action(name: "regenerate" | "duplicate") {
    if (!lesson) return;
    setWorking(true);
    try {
      const next = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lesson.id}/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: name === "regenerate" ? JSON.stringify({ source }) : undefined,
        }),
      );
      storeLesson(next, name === "regenerate");
      toast.success(
        name === "regenerate"
          ? "New lesson version generated."
          : "Lesson duplicated.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setWorking(false);
    }
  }

  async function save(content: LessonPlanInput) {
    if (!lesson) return;
    setWorking(true);
    try {
      const updated = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lesson.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }),
      );
      storeLesson(updated);
      setEditing(false);
      toast.success("Lesson version saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setWorking(false);
    }
  }

  const fieldClass =
    "bg-muted h-10 w-full rounded-lg border-0 px-3 text-sm outline-none";
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-3xl">AI Lesson Builder</h1>
            <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-[10px] font-bold">
              PLUS
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Structured plans for the classroom.
          </p>
        </div>
        <div className="w-full sm:w-48">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-bold">
              {workspace.usage.used} / {workspace.usage.limit}
            </span>
            <span className="text-muted-foreground">this month</span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{
                width: `${Math.min(100, (workspace.usage.used / workspace.usage.limit) * 100)}%`,
              }}
            />
          </div>
        </div>
      </header>

      <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => {
            setLesson(null);
            setSource(EMPTY_SOURCE);
            setEditing(false);
          }}
          className="bg-primary text-primary-foreground flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-xs font-bold"
        >
          <Sparkles className="size-4" />
          New lesson
        </button>
        {workspace.lessons.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => void selectLesson(item.id)}
            className={`h-10 max-w-56 shrink-0 truncate rounded-lg border px-4 text-left text-xs font-bold ${lesson?.id === item.id ? "border-primary text-primary bg-primary/5" : "bg-card"}`}
          >
            {item.title}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.6fr)]">
        <section className="bg-card rounded-xl border p-5 lg:sticky lg:top-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <WandSparkles className="text-accent size-4" />
            Lesson parameters
          </h2>
          <div className="space-y-4">
            <label className="grid gap-1.5 text-xs font-bold">
              Subject
              <select
                value={source.subject}
                onChange={(event) =>
                  setSource({ ...source, subject: event.target.value })
                }
                className={fieldClass}
              >
                {SUBJECTS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold">
              Grade level
              <select
                value={source.gradeLevel}
                onChange={(event) =>
                  setSource({ ...source, gradeLevel: event.target.value })
                }
                className={fieldClass}
              >
                {GRADES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold">
              Topic / unit
              <input
                value={source.topic}
                maxLength={240}
                onChange={(event) =>
                  setSource({ ...source, topic: event.target.value })
                }
                placeholder="Dividing fractions with visual models"
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold">
              Duration
              <select
                value={source.durationMinutes}
                onChange={(event) =>
                  setSource({
                    ...source,
                    durationMinutes: Number(event.target.value),
                  })
                }
                className={fieldClass}
              >
                {[30, 45, 60, 75, 90].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold">
              Learning objectives
              <textarea
                value={source.objectives}
                maxLength={2000}
                onChange={(event) =>
                  setSource({ ...source, objectives: event.target.value })
                }
                rows={3}
                className="bg-muted resize-none rounded-lg px-3 py-2 text-sm font-normal outline-none"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold">
              Standards
              <input
                value={source.standards}
                maxLength={1000}
                onChange={(event) =>
                  setSource({ ...source, standards: event.target.value })
                }
                placeholder="CCSS.MATH.5.NF.B.7"
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold">
              Student needs
              <textarea
                value={source.studentNeeds}
                maxLength={2000}
                onChange={(event) =>
                  setSource({ ...source, studentNeeds: event.target.value })
                }
                rows={2}
                className="bg-muted resize-none rounded-lg px-3 py-2 text-sm font-normal outline-none"
              />
            </label>
            <fieldset>
              <legend className="mb-1.5 text-xs font-bold">
                Teaching style
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(["inquiry", "balanced", "direct"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() =>
                      setSource({ ...source, teachingStyle: style })
                    }
                    className={`h-9 rounded-lg text-xs font-bold capitalize ${source.teachingStyle === style ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={
                working ||
                workspace.usage.remaining === 0 ||
                source.topic.trim().length < 3
              }
              className="bg-accent text-accent-foreground flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {working ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate lesson
            </button>
          </div>
        </section>

        <section className="min-w-0">
          {working && !lesson && (
            <div className="bg-card grid min-h-80 place-items-center rounded-xl border p-10 text-center">
              <div>
                <LoaderCircle className="text-primary mx-auto size-10 animate-spin" />
                <p className="mt-4 font-bold">Building your lesson...</p>
              </div>
            </div>
          )}
          {!working && !lesson && (
            <div className="bg-card grid min-h-80 place-items-center rounded-xl border border-dashed p-10 text-center">
              <div>
                <Sparkles className="text-muted-foreground/30 mx-auto size-10" />
                <p className="mt-4 font-bold">Ready to generate</p>
              </div>
            </div>
          )}
          {lesson && editing && (
            <LessonEditor
              content={lesson.content}
              saving={working}
              onCancel={() => setEditing(false)}
              onSave={(content) => void save(content)}
            />
          )}
          {lesson && !editing && (
            <LessonDisplay
              lesson={lesson}
              working={working}
              onEdit={() => setEditing(true)}
              onRegenerate={() => void action("regenerate")}
              onDuplicate={() => void action("duplicate")}
            />
          )}
        </section>
      </div>
    </div>
  );
}
