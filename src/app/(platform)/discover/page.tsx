import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DiscoverFilters } from "@/features/network/discover-filters";
import { EducatorCard } from "@/features/network/educator-card";
import { requireCurrentAccount } from "@/lib/auth/session";
import { discoverEducators } from "@/lib/network/server";
import { discoveryFiltersSchema } from "@/schemas/network";

export const metadata: Metadata = { title: "Discover educators" };

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

const grades = [
  "Early Childhood",
  "Elementary",
  "Middle School",
  "High School",
  "Higher Education",
  "All Grades",
];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, params] = await Promise.all([
    requireCurrentAccount(),
    searchParams,
  ]);
  const filters = discoveryFiltersSchema.parse({
    query: first(params.q),
    subject: first(params.subject),
    grade: first(params.grade),
    location: first(params.location),
    verified: first(params.verified) === "true",
  });
  const educators = await discoverEducators(account.uid, filters);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Discover teachers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Find educators by professional context and shared interests.
          </p>
        </div>
        <Link
          href="/network?view=suggestions"
          className="text-primary text-sm font-semibold hover:underline"
        >
          View suggestions
        </Link>
      </div>
      <div className="mt-6">
        <DiscoverFilters values={filters} subjects={subjects} grades={grades} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {educators.length} {educators.length === 1 ? "teacher" : "teachers"}{" "}
          found
        </p>
        {(filters.query ||
          filters.subject ||
          filters.grade ||
          filters.location ||
          filters.verified) && (
          <Link
            href="/discover"
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Clear filters
          </Link>
        )}
      </div>
      {educators.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {educators.map((result) => (
            <EducatorCard
              key={result.profile.uid}
              result={result}
              viewerUid={account.uid}
            />
          ))}
        </div>
      ) : (
        <section className="bg-card mt-4 rounded-2xl border p-12 text-center">
          <Users
            aria-hidden="true"
            className="text-muted-foreground/40 mx-auto size-9"
          />
          <h2 className="mt-3 font-serif text-xl">
            No educators match these filters
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Broaden the subject, grade, location, or search terms.
          </p>
        </section>
      )}
    </main>
  );
}
