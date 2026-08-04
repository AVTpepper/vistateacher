"use client";

import { Filter, Search } from "lucide-react";
import { useState } from "react";

export function DiscoverFilters({
  values,
  subjects,
  grades,
}: {
  values: {
    query: string;
    subject: string;
    grade: string;
    location: string;
    verified: boolean;
  };
  subjects: string[];
  grades: string[];
}) {
  const [showFilters, setShowFilters] = useState(
    Boolean(
      values.subject || values.grade || values.location || values.verified,
    ),
  );
  return (
    <form action="/discover">
      <div className="flex gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search educators</span>
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <input
            name="q"
            defaultValue={values.query}
            placeholder="Search by name, subject, school..."
            className="bg-card focus:ring-primary/20 h-11 w-full rounded-xl border pr-4 pl-10 text-sm outline-none focus:ring-2"
          />
        </label>
        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          aria-expanded={showFilters}
          className="bg-card text-muted-foreground hover:text-foreground flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
        >
          <Filter aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Filters</span>
        </button>
        <button className="bg-primary text-primary-foreground h-11 rounded-xl px-4 text-sm font-semibold">
          Search
        </button>
      </div>
      {showFilters && (
        <div className="bg-card mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-4">
          <FilterSelect
            name="subject"
            label="Subject"
            value={values.subject}
            options={subjects}
          />
          <FilterSelect
            name="grade"
            label="Grade"
            value={values.grade}
            options={grades}
          />
          <label className="space-y-1 text-xs font-semibold">
            <span>Location</span>
            <input
              name="location"
              defaultValue={values.location}
              className="bg-background h-9 w-full rounded-lg border px-3 text-sm font-normal"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs font-semibold">
            <input
              name="verified"
              value="true"
              type="checkbox"
              defaultChecked={values.verified}
              className="accent-primary size-4"
            />
            Verified educators only
          </label>
        </div>
      )}
    </form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="space-y-1 text-xs font-semibold">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="bg-background h-9 w-full rounded-lg border px-2 text-sm font-normal"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
