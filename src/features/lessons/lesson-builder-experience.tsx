"use client";

import {
  AlertTriangle,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  Eye,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Pencil,
  RotateCw,
  Save,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { DraftStatus } from "@/components/ui/draft-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRecoveredDraft } from "@/lib/creation-drafts/use-recovered-draft";
import { LessonEditor } from "@/features/lessons/lesson-editor";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { GoogleDocExport } from "@/features/teaching-exports/google-doc-export";
import {
  LimitUpgradeDialog,
  LimitUpgradeNotice,
  type UpgradePromptReason,
} from "@/features/billing/limit-upgrade-prompt";
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

const lessonMenuItemClass =
  "data-[highlighted]:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold outline-none data-[disabled]:opacity-50";

const EMPTY_SOURCE: LessonSourceInput = {
  subject: "Mathematics",
  gradeLevel: "5th Grade",
  topic: "",
  durationMinutes: 60,
  objectives: "",
  standards: "",
  studentNeeds: "",
  teachingStyle: "balanced",
  curriculum: "",
  language: "English",
  availableMaterials: "",
  additionalInstructions: "",
};

const REQUIRED_GENERATE_FIELDS = [
  "Subject",
  "Grade level",
  "Topic / unit",
  "Duration",
] as const;

function missingGenerateFields(source: LessonSourceInput): string[] {
  const missing: string[] = [];
  if (!source.subject.trim()) missing.push("Subject");
  if (!source.gradeLevel.trim()) missing.push("Grade level");
  if (source.topic.trim().length < 3) missing.push("Topic / unit");
  if (
    !Number.isInteger(source.durationMinutes) ||
    source.durationMinutes < 15 ||
    source.durationMinutes > 240
  ) {
    missing.push("Duration");
  }
  return missing;
}

function formatMissingFields(fields: string[]): string {
  if (fields.length === 0) return "";
  if (fields.length === 1) return fields[0];
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`;
  return `${fields.slice(0, -1).join(", ")}, and ${fields[fields.length - 1]}`;
}

interface CreateLessonsResponse {
  lessons: LessonDetail[];
}

class LessonRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function asSummary(lesson: LessonDetail): LessonSummary {
  return {
    id: lesson.id,
    title: lesson.title,
    subject: lesson.subject,
    gradeLevel: lesson.gradeLevel,
    durationMinutes: lesson.durationMinutes,
    currentVersion: lesson.currentVersion,
    visibility: lesson.visibility,
    generationStatus: lesson.generationStatus,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

async function resultJson<T>(response: Response): Promise<T> {
  const result = (await response.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;
  if (!response.ok)
    throw new LessonRequestError(
      result?.error ?? "The request could not be completed.",
      result?.code,
    );
  return result as T;
}

function PlanningTextarea({
  label,
  value,
  onChange,
  rows = 3,
  maxLength = 2000,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-bold">
      <span>{label}</span>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="font-normal"
      />
    </label>
  );
}

function LessonDisplay({
  lesson,
  working,
  onEdit,
  onRegenerate,
  onRegenerateWithFeedback,
  onDelete,
  onDuplicate,
  onPreviewPdf,
  onExport,
  onPublish,
  canRegenerate,
  canExport,
}: {
  lesson: LessonDetail;
  working: boolean;
  onEdit: () => void;
  onRegenerate: () => void;
  onRegenerateWithFeedback: (feedback: string) => void;
  onDelete: () => Promise<void>;
  onDuplicate: () => void;
  onPreviewPdf: () => void;
  onExport: (format: "pdf" | "docx") => void;
  onPublish: () => void;
  canRegenerate: boolean;
  canExport: boolean;
}) {
  const [expanded, setExpanded] = useState("objectives");
  const [feedback, setFeedback] = useState("");
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
        <div className="border-primary/20 rounded-lg border p-4">
          <p className="text-primary mb-2 text-xs font-bold uppercase">
            Supports
          </p>
          {list(content.differentiation.supports)}
        </div>
        <div className="border-accent/20 rounded-lg border p-4">
          <p className="text-accent-readable mb-2 text-xs font-bold uppercase">
            Extensions
          </p>
          {list(content.differentiation.extensions)}
        </div>
      </div>
    );
  };
  return (
    <div className="surface-card overflow-hidden">
      <div
        className="p-5 text-white sm:p-6"
        style={{ backgroundColor: "#673048" }}
      >
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
            <p className="mt-2 text-xs font-semibold text-white/80">
              {lesson.visibility === "draft"
                ? "Private draft"
                : "Published to the community"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="inverse"
              type="button"
              disabled={working}
              onClick={onEdit}
            >
              <Pencil className="size-3" />
              Edit
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="inverse" type="button" disabled={working}>
                  <Download className="size-3" />
                  Export
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  aria-label="Lesson exports"
                  className="bg-card text-card-foreground z-50 min-w-48 rounded-xl border p-1 shadow-xl"
                >
                  {[
                    { label: "Preview PDF", action: onPreviewPdf, icon: Eye },
                    {
                      label: "Download PDF",
                      action: () => onExport("pdf"),
                      icon: Download,
                    },
                    {
                      label: "Download Word",
                      action: () => onExport("docx"),
                      icon: FileText,
                    },
                  ].map(({ label, action, icon: Icon }) => (
                    <DropdownMenu.Item
                      key={label}
                      disabled={working || !canExport}
                      onSelect={action}
                      className={lessonMenuItemClass}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <GoogleDocExport
              key={`${lesson.id}:${lesson.currentVersion}`}
              kind="lesson"
              sourceId={lesson.id}
              version={lesson.currentVersion}
              disabled={working || !canExport}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="inverse" type="button" disabled={working}>
                  More
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  aria-label="More lesson actions"
                  className="bg-card text-card-foreground z-50 min-w-48 rounded-xl border p-1 shadow-xl"
                >
                  <DropdownMenu.Item asChild className={lessonMenuItemClass}>
                    <Link href={`/worksheets/new?lesson=${lesson.id}`}>
                      <FileText className="size-4" aria-hidden="true" />
                      Create worksheet from lesson
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={onDuplicate}
                    className={lessonMenuItemClass}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                    Duplicate
                  </DropdownMenu.Item>
                  {lesson.visibility === "draft" && (
                    <DropdownMenu.Item
                      onSelect={onPublish}
                      className={lessonMenuItemClass}
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      Publish to community
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="bg-border my-1 h-px" />
                  <DeleteConfirmDialog
                    itemName="lesson"
                    onConfirm={onDelete}
                    consequence="Google Docs and separately published resource copies remain. Manage them in Google Drive or Resources."
                  >
                    <DropdownMenu.Item
                      onSelect={(event) => event.preventDefault()}
                      className={`${lessonMenuItemClass} text-destructive`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete lesson
                    </DropdownMenu.Item>
                  </DeleteConfirmDialog>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
      <div className="divide-y">
        {sections.map((section) => {
          const Icon = section.icon;
          const open = expanded === section.key;
          return (
            <div key={section.key}>
              <Button
                variant="ghost"
                id={`lesson-section-trigger-${section.key}`}
                type="button"
                aria-controls={`lesson-section-panel-${section.key}`}
                aria-expanded={open}
                onClick={() => setExpanded(open ? "" : section.key)}
                className="hover:bg-muted/40 flex w-full items-center justify-between p-4 text-left"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="bg-primary/10 grid size-8 shrink-0 place-items-center rounded-lg">
                    <Icon aria-hidden="true" className="text-primary size-4" />
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
                  <ChevronDown aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
              </Button>
              {open && (
                <div
                  id={`lesson-section-panel-${section.key}`}
                  role="region"
                  aria-labelledby={`lesson-section-trigger-${section.key}`}
                  className="px-4 pb-5 text-sm leading-6 sm:px-5"
                >
                  {body(section.key)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="bg-muted flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <History className="size-4" />
            Version {lesson.currentVersion} · {lesson.versions.length} saved
            versions
          </div>
          <label className="mt-2 grid gap-1 text-xs font-bold">
            Direct feedback to AI (fresh lesson regeneration)
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Example: Keep the same topic but make it project-based and include a stronger formative assessment rubric."
              className="bg-background resize-none rounded-lg px-3 py-2 text-xs font-normal outline-none"
            />
          </label>
          <Button
            variant="ghost"
            type="button"
            disabled={working || !canRegenerate || feedback.trim().length < 3}
            onClick={() => onRegenerateWithFeedback(feedback)}
            className="border-primary text-primary mt-1 flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"
          >
            <WandSparkles className="size-3" />
            Regenerate With Feedback
          </Button>
        </div>
        <Button
          variant="ghost"
          type="button"
          onClick={onRegenerate}
          disabled={working || !canRegenerate}
          className="border-primary text-primary flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-bold disabled:opacity-50"
        >
          {working ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RotateCw className="size-4" />
          )}
          Regenerate
        </Button>
      </div>
    </div>
  );
}

export function LessonBuilderExperience({
  viewerUid,
  initialWorkspace,
  initialLesson,
  sampleMode = false,
}: {
  viewerUid: string;
  initialWorkspace: LessonWorkspace;
  initialLesson: LessonDetail | null;
  sampleMode?: boolean;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [lesson, setLesson] = useState(initialLesson);
  const sourceRecovery = useRecoveredDraft(
    `lesson-source:${viewerUid}`,
    EMPTY_SOURCE,
  );
  const source = lesson?.source ?? sourceRecovery.value;
  const setSource = sourceRecovery.setValue;
  const [lessonCount, setLessonCount] = useState(1);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const lessonResultRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!lesson?.id || editing) return;
    lessonResultRef.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
    lessonResultRef.current?.focus({ preventScroll: true });
  }, [lesson?.id, lesson?.currentVersion, editing]);
  const [attemptedGenerate, setAttemptedGenerate] = useState(false);
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradePromptReason | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({
    published: true,
    draft: true,
  });

  function consumeUsage(
    usage: LessonWorkspace["usage"],
    kind: "creation" | "refinement" | "export",
    count = 1,
  ) {
    if (count <= 0) return usage;
    if (kind === "export") {
      if (usage.exports.limit === null) return usage;
      return {
        ...usage,
        exports: {
          ...usage.exports,
          used: usage.exports.used + count,
          remaining: Math.max(0, (usage.exports.remaining ?? 0) - count),
        },
      };
    }
    return {
      ...usage,
      used: usage.used + count,
      remaining: Math.max(0, usage.remaining - count),
    };
  }

  function showUpgradeFor(error: unknown): boolean {
    if (workspace.plan !== "free" || !(error instanceof LessonRequestError)) {
      return false;
    }
    const reasonByCode: Partial<Record<string, UpgradePromptReason>> = {
      "limit-reached": "ai-generations",
    };
    const reason = error.code ? reasonByCode[error.code] : null;
    if (!reason) return false;
    setUpgradeReason(reason);
    return true;
  }

  async function selectLesson(lessonId: string) {
    if (!lessonId) return setLesson(null);
    setWorking(true);
    try {
      const selected = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lessonId}`),
      );
      setLesson(selected);
      setEditing(false);
      setAttemptedGenerate(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Lesson unavailable.",
      );
    } finally {
      setWorking(false);
    }
  }

  function storeLesson(
    next: LessonDetail,
    consumesQuota: "creation" | "refinement" | null = null,
  ) {
    setLesson(next);
    setWorkspace((current) => ({
      ...current,
      usage: consumesQuota
        ? consumeUsage(current.usage, consumesQuota)
        : current.usage,
      lessons: [
        asSummary(next),
        ...current.lessons.filter((item) => item.id !== next.id),
      ],
    }));
  }

  async function generate() {
    setAttemptedGenerate(true);
    const missing = missingGenerateFields(source);
    if (missing.length > 0) {
      toast.error(
        `Fill out ${formatMissingFields(missing)} before generating.`,
      );
      return;
    }
    setWorking(true);
    try {
      const generated = await resultJson<LessonDetail | CreateLessonsResponse>(
        await fetch("/api/ai-lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, count: lessonCount }),
        }),
      );
      const lessons = "lessons" in generated ? generated.lessons : [generated];
      lessons.forEach((item) => storeLesson(item, "creation"));
      sourceRecovery.setValue(EMPTY_SOURCE);
      sourceRecovery.clear();
      setAttemptedGenerate(false);
      toast.success(
        lessons.length > 1
          ? `${lessons.length} lessons generated and saved as drafts.`
          : "Lesson generated and saved as a draft.",
      );
    } catch (error) {
      if (!showUpgradeFor(error)) {
        toast.error(
          error instanceof Error ? error.message : "Generation failed.",
        );
      }
    } finally {
      setWorking(false);
    }
  }

  async function action(
    name: "regenerate" | "duplicate",
    options?: { feedback?: string; referenceContent?: LessonPlanInput },
  ) {
    if (!lesson) return false;
    setWorking(true);
    try {
      const next = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lesson.id}/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            name === "regenerate"
              ? JSON.stringify({
                  source,
                  feedback: options?.feedback,
                  referenceContent: options?.referenceContent,
                })
              : undefined,
        }),
      );
      storeLesson(next, name === "regenerate" ? "refinement" : null);
      setEditing(false);
      toast.success(
        name === "regenerate"
          ? "New lesson version generated."
          : "Lesson duplicated.",
      );
      return true;
    } catch (error) {
      if (!showUpgradeFor(error)) {
        toast.error(error instanceof Error ? error.message : "Action failed.");
      }
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function saveWithVisibility(
    content: LessonPlanInput,
    visibility: "draft" | "published",
  ) {
    if (!lesson) return false;
    setWorking(true);
    try {
      const updated = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lesson.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, visibility }),
        }),
      );
      storeLesson(updated);
      setEditing(false);
      toast.success("Lesson version saved.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function deleteLessonById(lessonId: string): Promise<void> {
    if (working)
      throw new Error(
        "Wait for the current lesson action to finish, then try again.",
      );
    setWorking(true);
    try {
      const response = await fetch(`/api/ai-lessons/${lessonId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed.");
      setWorkspace((current) => ({
        ...current,
        lessons: current.lessons.filter((item) => item.id !== lessonId),
      }));
      if (lesson?.id === lessonId) {
        setLesson(null);
        setEditing(false);
      }
      toast.success("Lesson deleted.");
    } finally {
      setWorking(false);
    }
  }

  async function exportLesson(format: "pdf" | "docx") {
    if (!lesson) return;
    setWorking(true);
    try {
      const response = await fetch(
        `/api/ai-lessons/${lesson.id}/export/${format}`,
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        throw new LessonRequestError(
          result?.error ?? "The lesson could not be exported.",
          result?.code,
        );
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? `lesson-plan.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setWorkspace((current) => ({
        ...current,
        usage: consumeUsage(current.usage, "export"),
      }));
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (error) {
      if (!showUpgradeFor(error)) {
        toast.error(error instanceof Error ? error.message : "Export failed.");
      }
    } finally {
      setWorking(false);
    }
  }

  async function previewPdf() {
    if (!lesson) return;
    setWorking(true);
    let previewWindow: Window | null = null;
    try {
      // Open during the click gesture so async generation does not trigger
      // popup blocking. Detach the opener before navigating to the PDF.
      previewWindow = window.open("about:blank", "_blank");
      if (!previewWindow) {
        toast.error("Enable pop-ups to preview the PDF.");
        return;
      }
      previewWindow.opener = null;
      previewWindow.document.title = "Preparing your PDF";
      previewWindow.document.body.textContent = "Preparing your PDF…";
      const response = await fetch(
        `/api/ai-lessons/${lesson.id}/export/pdf?preview=1`,
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        throw new LessonRequestError(
          result?.error ?? "Preview failed.",
          result?.code,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (previewWindow.closed) {
        URL.revokeObjectURL(url);
        return;
      }
      previewWindow.document.title = "Lesson PDF";
      previewWindow.document.body.textContent =
        "Your PDF is ready. Your browser will open it or save it to Downloads.";
      previewWindow.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      toast.success("PDF preview opened.");
    } catch (error) {
      previewWindow?.close();
      if (!showUpgradeFor(error)) {
        toast.error(error instanceof Error ? error.message : "Preview failed.");
      }
    } finally {
      setWorking(false);
    }
  }

  async function publishLesson(): Promise<void> {
    if (!lesson) return;
    setWorking(true);
    try {
      const updated = await resultJson<LessonDetail>(
        await fetch(`/api/ai-lessons/${lesson.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: lesson.content,
            visibility: "published",
          }),
        }),
      );
      storeLesson(updated);
      toast.success("Lesson published to Resources and community search.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      setWorking(false);
    }
  }

  const fieldClass =
    "input-shell bg-background h-11 w-full rounded-xl border px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";
  const missingFields = missingGenerateFields(source);
  const showGenerateErrors = attemptedGenerate && missingFields.length > 0;
  const requiredHelper = `Fill out ${formatMissingFields([...REQUIRED_GENERATE_FIELDS])} before generating.`;
  const exhaustedReasons: UpgradePromptReason[] =
    workspace.plan === "free" && workspace.usage.remaining === 0
      ? ["ai-generations"]
      : [];
  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl">AI Lesson Builder</h1>
            <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-[10px] font-bold">
              {workspace.plan === "plus" ? "PLUS" : "COMMUNITY"}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Structured plans for the classroom.
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-muted rounded-lg px-3 py-2">
              <strong>AI actions</strong> {workspace.usage.remaining} of{" "}
              {workspace.usage.limit} remaining
            </span>
            <span className="bg-muted rounded-lg px-3 py-2">
              <strong>PDF / Word exports</strong> Unlimited
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            Monthly allowances reset{" "}
            {new Intl.DateTimeFormat("en", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(workspace.usage.resetsAt))}{" "}
            at 00:00 UTC.
            {
              " Each new lesson or AI refinement uses one action from the same allowance. Editing and exporting are free."
            }
          </p>
        </div>
      </header>

      {sampleMode && (
        <p
          className="bg-muted mb-5 rounded-xl border p-4 text-sm"
          role="status"
        >
          Sample mode: generated lessons use demonstration content, without an
          AI request. Output language and teaching instructions are applied when
          the OpenAI provider is connected.
        </p>
      )}

      <LimitUpgradeNotice reasons={exhaustedReasons} className="mb-5" />

      <div className="mb-5 space-y-3">
        <Button
          variant="ghost"
          type="button"
          disabled={working}
          onClick={() => {
            setLesson(null);
            setLessonCount(1);
            setEditing(false);
            setAttemptedGenerate(false);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-11 items-center gap-2 rounded-lg px-4 text-xs font-bold"
        >
          <Sparkles className="size-4" />
          New lesson
        </Button>
        {[
          { key: "published", label: "Published Lessons", icon: BookOpen },
          { key: "draft", label: "Draft Lessons", icon: Save },
        ].map((category) => {
          const items = workspace.lessons.filter(
            (item) => item.visibility === category.key,
          );
          if (items.length === 0) return null;
          const Icon = category.icon;
          const isExpanded = expandedCategories[category.key];
          return (
            <div key={category.key}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setExpandedCategories((prev) => ({
                      ...prev,
                      [category.key]: !prev[category.key],
                    }))
                  }
                  className="text-primary flex items-center gap-2 text-xs font-bold"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <Icon className="size-4" />
                  {category.label} ({items.length})
                </Button>
                {category.key === "published" && (
                  <Link
                    href="/resources"
                    className="text-muted-foreground hover:text-primary text-xs font-semibold hover:underline"
                  >
                    Browse in Resources
                  </Link>
                )}
              </div>
              {isExpanded && (
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex max-w-72 items-center overflow-hidden rounded-lg border transition-colors ${
                        lesson?.id === item.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={`Continue refining ${item.title}`}
                        disabled={working}
                        onClick={() => void selectLesson(item.id)}
                        className="h-11 min-w-0 flex-1 truncate px-3 text-left text-xs font-bold"
                      >
                        {item.title}
                      </Button>
                      <DeleteConfirmDialog
                        itemName="lesson"
                        consequence="Google Docs and separately published resource copies remain. Manage them in Google Drive or Resources."
                        onConfirm={() => deleteLessonById(item.id)}
                      >
                        <Button
                          variant="ghost"
                          type="button"
                          aria-label={`Delete ${item.title}`}
                          className="hover:bg-destructive/10 hover:text-destructive grid size-11 shrink-0 place-items-center"
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        </Button>
                      </DeleteConfirmDialog>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className={`grid items-start gap-5 ${!lesson ? "lg:grid-cols-[minmax(360px,1fr)_minmax(0,1fr)]" : ""}`}
      >
        {!lesson && (
          <section className="surface-card p-5 lg:sticky lg:top-5">
            <fieldset disabled={working} className="min-w-0">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
                <WandSparkles className="text-accent-readable size-4" />
                Lesson parameters
              </h2>
              <p className="text-muted-foreground mb-3 text-xs leading-5">
                {requiredHelper}
              </p>
              <div className="mb-3">
                <DraftStatus
                  status={sourceRecovery.status}
                  restored={sourceRecovery.restored}
                />
              </div>
              {sourceRecovery.status !== "idle" && (
                <Button
                  variant="ghost"
                  type="button"
                  className="text-destructive mb-3 min-h-11 text-sm font-semibold"
                  onClick={() => {
                    sourceRecovery.setValue(EMPTY_SOURCE);
                    sourceRecovery.clear();
                  }}
                >
                  Discard parameter draft
                </Button>
              )}
              {showGenerateErrors && (
                <p
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  <AlertTriangle
                    className="mr-1 inline size-3.5"
                    aria-hidden="true"
                  />
                  Fill out {formatMissingFields(missingFields)} to generate a
                  lesson.
                </p>
              )}
              <div className="space-y-4">
                <label className="grid gap-1.5 text-sm font-bold">
                  <span>
                    Subject
                    {showGenerateErrors && missingFields.includes("Subject") ? (
                      <span className="text-red-600"> *</span>
                    ) : null}
                  </span>
                  <Input
                    list="lesson-subject-suggestions"
                    maxLength={80}
                    placeholder="Type any school subject"
                    value={source.subject}
                    onChange={(event) =>
                      setSource({ ...source, subject: event.target.value })
                    }
                    className={fieldClass}
                    aria-invalid={
                      showGenerateErrors && missingFields.includes("Subject")
                    }
                  />
                  <datalist id="lesson-subject-suggestions">
                    {SUBJECTS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  <span>
                    Grade level
                    {showGenerateErrors &&
                    missingFields.includes("Grade level") ? (
                      <span className="text-red-600"> *</span>
                    ) : null}
                  </span>
                  <Input
                    list="lesson-grade-suggestions"
                    maxLength={80}
                    placeholder="Grade, age group, or mixed-age class"
                    value={source.gradeLevel}
                    onChange={(event) =>
                      setSource({ ...source, gradeLevel: event.target.value })
                    }
                    className={fieldClass}
                    aria-invalid={
                      showGenerateErrors &&
                      missingFields.includes("Grade level")
                    }
                  />
                  <datalist id="lesson-grade-suggestions">
                    {GRADES.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  <span>
                    Topic / unit
                    {showGenerateErrors &&
                    missingFields.includes("Topic / unit") ? (
                      <span className="text-red-600"> *</span>
                    ) : null}
                  </span>
                  <input
                    value={source.topic}
                    maxLength={240}
                    onChange={(event) =>
                      setSource({ ...source, topic: event.target.value })
                    }
                    placeholder="Dividing fractions with visual models"
                    className={fieldClass}
                    aria-invalid={
                      showGenerateErrors &&
                      missingFields.includes("Topic / unit")
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  <span>
                    Duration
                    {showGenerateErrors &&
                    missingFields.includes("Duration") ? (
                      <span className="text-red-600"> *</span>
                    ) : null}
                  </span>
                  <Input
                    type="number"
                    aria-label="Duration"
                    aria-describedby="lesson-duration-hint"
                    min={15}
                    max={240}
                    step={1}
                    value={source.durationMinutes}
                    onChange={(event) =>
                      setSource({
                        ...source,
                        durationMinutes: Number(event.target.value),
                      })
                    }
                    className={fieldClass}
                    aria-invalid={
                      showGenerateErrors && missingFields.includes("Duration")
                    }
                  />
                  <span
                    id="lesson-duration-hint"
                    className="text-muted-foreground text-xs font-normal"
                  >
                    15–240 minutes
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-bold">
                  Lessons to generate
                  <select
                    value={lessonCount}
                    onChange={(event) =>
                      setLessonCount(Number(event.target.value))
                    }
                    className={fieldClass}
                  >
                    {Array.from({ length: 5 }, (_, index) => index + 1).map(
                      (count) => (
                        <option key={count} value={count}>
                          {count} lesson{count === 1 ? "" : "s"}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <PlanningTextarea
                  label="Learning objectives (optional)"
                  value={source.objectives}
                  onChange={(objectives) =>
                    setSource({ ...source, objectives })
                  }
                  placeholder="Example: Students will be able to divide fractions using visual models"
                  rows={3}
                />
                <label className="grid gap-1.5 text-sm font-bold">
                  Standards (optional)
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
                <PlanningTextarea
                  label="Student needs (optional)"
                  value={source.studentNeeds}
                  onChange={(studentNeeds) =>
                    setSource({ ...source, studentNeeds })
                  }
                  placeholder="Example: Struggling readers, English language learners, gifted learners"
                  rows={2}
                />
                <details className="rounded-xl border px-3 py-2">
                  <summary className="text-primary flex min-h-11 cursor-pointer items-center text-sm font-bold">
                    More teaching context (optional)
                  </summary>
                  <div className="space-y-4 pt-3 pb-2">
                    <p className="text-muted-foreground text-sm leading-6">
                      Add what matters for your classroom. Describe learning
                      needs without student names or personal records.
                    </p>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Curriculum / country
                      <Input
                        maxLength={500}
                        value={source.curriculum ?? ""}
                        onChange={(event) =>
                          setSource({
                            ...source,
                            curriculum: event.target.value,
                          })
                        }
                        placeholder="e.g. Swedish Lgr22, IB, or your local curriculum"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Output language
                      <Input
                        maxLength={80}
                        value={source.language ?? "English"}
                        onChange={(event) =>
                          setSource({ ...source, language: event.target.value })
                        }
                        placeholder="e.g. English, Swedish, or bilingual"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-bold">
                      Class size
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={source.classSize ?? ""}
                        onChange={(event) =>
                          setSource({
                            ...source,
                            classSize: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                      />
                    </label>
                    <PlanningTextarea
                      label="Available materials and technology"
                      value={source.availableMaterials ?? ""}
                      onChange={(availableMaterials) =>
                        setSource({ ...source, availableMaterials })
                      }
                      maxLength={1000}
                      rows={2}
                      placeholder="e.g. Paper and pencils; no devices or printer"
                    />
                    <PlanningTextarea
                      label="Additional teacher instructions"
                      value={source.additionalInstructions ?? ""}
                      onChange={(additionalInstructions) =>
                        setSource({ ...source, additionalInstructions })
                      }
                      rows={3}
                      placeholder="e.g. Include outdoor learning, use local examples, avoid homework"
                    />
                  </div>
                </details>
                <fieldset>
                  <legend className="mb-1.5 text-xs font-bold">
                    Teaching style
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(["inquiry", "balanced", "direct"] as const).map(
                      (style) => (
                        <Button
                          variant="ghost"
                          key={style}
                          type="button"
                          aria-pressed={source.teachingStyle === style}
                          onClick={() =>
                            setSource({ ...source, teachingStyle: style })
                          }
                          className={`h-11 rounded-lg text-xs font-bold capitalize ${source.teachingStyle === style ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {style}
                        </Button>
                      ),
                    )}
                  </div>
                </fieldset>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => void generate()}
                  disabled={
                    working ||
                    workspace.usage.remaining < lessonCount ||
                    source.topic.trim().length < 3
                  }
                  className="bg-accent text-accent-foreground hover:bg-accent/90 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {working ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate{" "}
                  {lessonCount > 1 ? `${lessonCount} lessons` : "lesson"}
                </Button>
              </div>
            </fieldset>
          </section>
        )}

        <section
          ref={lessonResultRef}
          tabIndex={lesson ? -1 : undefined}
          aria-label={lesson ? "Lesson result" : undefined}
          className="min-w-0 scroll-mt-5"
        >
          {working && !lesson && (
            <div className="surface-card grid min-h-110 place-items-center p-10 text-center">
              <div>
                <LoaderCircle className="text-primary mx-auto size-10 animate-spin" />
                <p className="mt-4 font-bold">Building your lesson...</p>
              </div>
            </div>
          )}
          {!working && !lesson && (
            <div className="surface-card grid min-h-110 place-items-center border-dashed p-10 text-center">
              <div>
                <Sparkles className="text-muted-foreground/30 mx-auto size-10" />
                <h2 className="mt-4 font-serif text-2xl">
                  Start with your teaching goal
                </h2>
                <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm leading-6">
                  Choose any subject and age group, describe your topic, and add
                  the context your students need. Your lesson will be saved
                  privately as a draft.
                </p>
                <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm leading-6">
                  Review and edit the result, then download a PDF or Word
                  document. Publishing is your choice.
                </p>
              </div>
            </div>
          )}
          {lesson && editing && (
            <LessonEditor
              key={`${lesson.id}:${lesson.currentVersion}`}
              recoveryKey={`lesson-edit:${viewerUid}:${lesson.id}`}
              currentVersion={lesson.currentVersion}
              content={lesson.content}
              visibility={lesson.visibility}
              saving={working}
              canRefine={workspace.usage.remaining > 0}
              onCancel={() => setEditing(false)}
              onSave={saveWithVisibility}
              onRefine={(feedback, referenceContent) =>
                action("regenerate", { feedback, referenceContent })
              }
            />
          )}
          {lesson && !editing && (
            <LessonDisplay
              lesson={lesson}
              working={working}
              onEdit={() => setEditing(true)}
              onRegenerate={() => void action("regenerate")}
              onRegenerateWithFeedback={(feedback) =>
                void action("regenerate", { feedback })
              }
              onDelete={() => deleteLessonById(lesson.id)}
              onDuplicate={() => void action("duplicate")}
              onPreviewPdf={() => void previewPdf()}
              onExport={(format) => void exportLesson(format)}
              onPublish={() => void publishLesson()}
              canRegenerate={workspace.usage.remaining > 0}
              canExport={workspace.usage.exports.remaining !== 0}
            />
          )}
        </section>
      </div>
      <LimitUpgradeDialog
        reason={upgradeReason}
        onOpenChange={(open) => {
          if (!open) setUpgradeReason(null);
        }}
      />
    </div>
  );
}
