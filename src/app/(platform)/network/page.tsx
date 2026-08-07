import { UserRoundSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EducatorCard } from "@/features/network/educator-card";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getNetworkList } from "@/lib/network/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your network" };

const views = ["connections", "suggestions"] as const;

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, params] = await Promise.all([
    requireCurrentAccount(),
    searchParams,
  ]);
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = views.includes(rawView as (typeof views)[number])
    ? (rawView as (typeof views)[number])
    : "connections";
  const profileUid =
    view === "suggestions"
      ? account.uid
      : Array.isArray(params.uid)
        ? (params.uid[0] ?? account.uid)
        : (params.uid ?? account.uid);
  const educators = await getNetworkList(account.uid, profileUid, view);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div>
        <h1 className="font-serif text-3xl">Educator network</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review connections and find educators with relevant experience.
        </p>
      </div>
      <nav
        aria-label="Network views"
        className="surface-card mt-6 flex gap-1 p-1"
      >
        {views.map((item) => (
          <Link
            key={item}
            href={`/network?view=${item}${profileUid !== account.uid && item !== "suggestions" ? `&uid=${encodeURIComponent(profileUid)}` : ""}`}
            className={cn(
              "flex h-10 flex-1 items-center justify-center rounded-lg text-sm font-semibold capitalize",
              view === item
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item}
          </Link>
        ))}
      </nav>
      {educators.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {educators.map((result) => (
            <EducatorCard
              key={result.profile.uid}
              result={result}
              viewerUid={account.uid}
            />
          ))}
        </div>
      ) : (
        <section className="surface-card mt-5 rounded-2xl p-12 text-center">
          <UserRoundSearch
            aria-hidden="true"
            className="text-muted-foreground/40 mx-auto size-9"
          />
          <h2 className="mt-3 font-serif text-xl">No {view} to show yet</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {view === "suggestions"
              ? "Suggestions appear as more active educators join the community."
              : "Discover educators and begin building your professional network."}
          </p>
          <Link
            href="/discover"
            className="text-primary mt-4 inline-block text-sm font-semibold hover:underline"
          >
            Discover educators
          </Link>
        </section>
      )}
    </div>
  );
}
