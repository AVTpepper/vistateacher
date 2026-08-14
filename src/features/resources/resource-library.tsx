"use client";

import {
  Activity,
  BookOpen,
  Download,
  FileText,
  Film,
  Filter,
  Grid2X2,
  List,
  Search,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
import { ResourceUploadDialog } from "@/features/resources/resource-upload-dialog";
import type { ResourceSummary } from "@/lib/resources/server";
import { cn } from "@/lib/utils";

const typeIcon = {
  "lesson-plan": FileText,
  worksheet: BookOpen,
  "unit-plan": Grid2X2,
  video: Film,
  activity: Activity,
};
const typeColor = {
  "lesson-plan": "bg-primary",
  worksheet: "bg-success",
  "unit-plan": "bg-violet",
  video: "bg-accent",
  activity: "bg-amber",
};

export function ResourceLibrary({
  resources,
}: {
  resources: ResourceSummary[];
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.toLocaleLowerCase("en-US"));
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [sort, setSort] = useState("downloads");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState(false);
  const subjects = [
    ...new Set(resources.map((resource) => resource.subject)),
  ].sort();
  const filtered = resources
    .filter((resource) => {
      const text = [
        resource.title,
        resource.description,
        resource.subject,
        ...resource.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("en-US");
      return (
        (!deferredQuery || text.includes(deferredQuery)) &&
        (!type || resource.type === type) &&
        (!subject || resource.subject === subject)
      );
    })
    .sort((left, right) => {
      if (sort === "rating") return right.ratingAverage - left.ratingAverage;
      if (sort === "reviews") return right.ratingCount - left.ratingCount;
      if (sort === "newest")
        return right.createdAt.localeCompare(left.createdAt);
      return right.downloadCount - left.downloadCount;
    });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Resources</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Teacher-made lesson plans, worksheets, activities, and more.
          </p>
        </div>
        <ResourceUploadDialog />
      </header>
      <div className="mb-4 flex items-center gap-3">
        <label className="surface-card relative max-w-md flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <span className="sr-only">Search resources</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search resources, tags, subjects..."
            className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setFilters((open) => !open)}
          aria-label={filters ? "Hide filters" : "Show filters"}
          aria-expanded={filters}
          className={cn(
            "surface-card text-muted-foreground flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold",
            filters && "border-primary text-primary",
          )}
        >
          <Filter aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Filters</span>
        </button>
        <div className="surface-card flex shrink-0 p-1">
          <ViewButton
            label="Grid view"
            active={view === "grid"}
            onClick={() => setView("grid")}
            icon={Grid2X2}
          />
          <ViewButton
            label="List view"
            active={view === "list"}
            onClick={() => setView("list")}
            icon={List}
          />
        </div>
      </div>
      {filters && (
        <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <Select
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: "", label: "All types" },
              { value: "lesson-plan", label: "Lesson plan" },
              { value: "worksheet", label: "Worksheet" },
              { value: "unit-plan", label: "Unit plan" },
              { value: "video", label: "Video" },
              { value: "activity", label: "Activity" },
            ]}
          />
          <Select
            label="Subject"
            value={subject}
            onChange={setSubject}
            options={[
              { value: "", label: "All subjects" },
              ...subjects.map((value) => ({ value, label: value })),
            ]}
          />
          <Select
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              { value: "downloads", label: "Most downloaded" },
              { value: "rating", label: "Highest rated" },
              { value: "newest", label: "Newest" },
              { value: "reviews", label: "Most reviewed" },
            ]}
          />
        </div>
      )}
      <div className="mb-5 flex gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1">
        {[
          { value: "", label: "All Types" },
          { value: "lesson-plan", label: "Lesson plans" },
          { value: "worksheet", label: "Worksheets" },
          { value: "unit-plan", label: "Unit plans" },
          { value: "video", label: "Videos" },
          { value: "activity", label: "Activities" },
        ].map((item) => (
          <button
            type="button"
            key={item.value}
            onClick={() => setType(item.value)}
            className={cn(
              "surface-card text-muted-foreground shrink-0 rounded-full px-4 py-2 text-xs font-semibold",
              type === item.value &&
                "bg-primary text-primary-foreground border-primary",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        {filtered.length} resources
      </p>
      {filtered.length ? (
        <div
          className={
            view === "grid"
              ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              : "space-y-3"
          }
        >
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} view={view} />
          ))}
        </div>
      ) : (
        <div className="surface-card py-16 text-center">
          <BookOpen
            aria-hidden="true"
            className="text-muted-foreground/40 mx-auto size-8"
          />
          <h2 className="mt-3 font-serif text-xl">No matching resources</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Try a broader search or another filter.
          </p>
        </div>
      )}
    </div>
  );
}

function ResourceCard({
  resource,
  view,
}: {
  resource: ResourceSummary;
  view: "grid" | "list";
}) {
  const Icon = typeIcon[resource.type];
  if (view === "list")
    return (
      <article className="surface-card surface-card-interactive group flex items-center gap-4 p-4">
        <Link
          href={`/resources/${resource.id}`}
          className={cn(
            "grid size-16 shrink-0 place-items-center rounded-lg text-white",
            typeColor[resource.type],
          )}
        >
          <Icon aria-hidden="true" className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/resources/${resource.id}`}
            className="hover:text-primary block truncate text-sm font-bold"
          >
            {resource.title}
          </Link>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {resource.description}
          </p>
          <ResourceMeta resource={resource} />
        </div>
        <DownloadLink resource={resource} compact={false} />
      </article>
    );
  return (
    <article className="surface-card surface-card-interactive group overflow-hidden">
      <Link
        href={`/resources/${resource.id}`}
        className={cn(
          "relative grid h-36 place-items-center text-white",
          typeColor[resource.type],
        )}
      >
        <Icon
          aria-hidden="true"
          className="size-12 opacity-80 transition-transform duration-200 group-hover:scale-110"
        />
        <span className="absolute top-2 left-2 rounded-full bg-black/25 px-2 py-1 text-[10px] font-bold capitalize">
          {resource.type.replace("-", " ")}
        </span>
      </Link>
      <div className="p-4">
        <Link
          href={`/resources/${resource.id}`}
          className="group-hover:text-primary line-clamp-2 text-sm leading-5 font-bold"
        >
          {resource.title}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <ProfileIdentityLink
            uid={resource.author.uid}
            displayName={resource.author.displayName}
            photoURL={resource.author.photoURL}
            avatarClassName="size-5 rounded-full text-[8px]"
            className="text-muted-foreground text-xs"
          />
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-xs">
          <span className="bg-muted rounded-full px-2 py-1">
            {resource.gradeLevel}
          </span>
          <span className="bg-muted max-w-28 truncate rounded-full px-2 py-1">
            {resource.subject}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <ResourceMeta resource={resource} />
          <DownloadLink resource={resource} compact />
        </div>
      </div>
    </article>
  );
}

function ResourceMeta({ resource }: { resource: ResourceSummary }) {
  return (
    <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1">
        <Star aria-hidden="true" className="text-amber size-3 fill-current" />
        {resource.ratingAverage.toFixed(1)} ({resource.ratingCount})
      </span>
      <span className="flex items-center gap-1">
        <Download aria-hidden="true" className="size-3" />
        {resource.downloadCount.toLocaleString()}
      </span>
    </div>
  );
}
function DownloadLink({
  resource,
  compact,
}: {
  resource: ResourceSummary;
  compact: boolean;
}) {
  if (resource.sourceLessonId)
    return (
      <Link
        href={`/lessons/${resource.sourceLessonId}`}
        className={cn(
          "bg-accent text-accent-foreground shrink-0 rounded-lg px-3 py-2 text-xs font-bold",
          !compact && "px-4",
        )}
        aria-label={`View ${resource.title}`}
      >
        View lesson
      </Link>
    );
  return (
    <a
      href={`/api/resources/${resource.id}/download`}
      className={cn(
        "bg-primary/10 text-primary shrink-0 rounded-lg px-3 py-2 text-xs font-bold",
        !compact && "bg-primary text-primary-foreground",
      )}
      aria-label={`Download ${resource.title}`}
    >
      Download
    </a>
  );
}
function ViewButton({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof Grid2X2;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground grid size-11 place-items-center rounded-lg",
        active && "bg-primary text-primary-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-muted-foreground text-xs">
      <span className="mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-muted text-foreground h-10 w-full rounded-lg px-3 text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
