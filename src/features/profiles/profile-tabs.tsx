"use client";

import { BookOpen, FileText, Users } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function ProfileTabs({
  displayName,
  bio,
  details,
  resources,
}: {
  displayName: string;
  bio: string;
  details: Array<{ label: string; value: string }>;
  resources: Array<{ id: string; title: string; type: string }>;
}) {
  const [active, setActive] = useState<"posts" | "resources" | "about">(
    "posts",
  );
  const tabs = [
    { key: "posts" as const, label: "Posts", icon: FileText },
    { key: "resources" as const, label: "Resources", icon: BookOpen },
    { key: "about" as const, label: "About", icon: Users },
  ];

  return (
    <>
      <div className="bg-card mt-4 flex gap-1 rounded-xl border p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={active === key}
            onClick={() => setActive(key)}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
              active === key &&
                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {active === "posts" && (
          <EmptyState
            icon={FileText}
            title={`Posts from ${displayName}`}
            detail="Published community posts will appear here."
          />
        )}
        {active === "resources" &&
          (resources.length ? (
            <div className="space-y-3">
              {resources.map((resource) => (
                <a
                  href={`/resources/${resource.id}`}
                  key={resource.id}
                  className="bg-card hover:border-primary/25 flex items-center gap-4 rounded-xl border p-4 transition-colors"
                >
                  <span className="bg-secondary text-primary grid size-12 shrink-0 place-items-center rounded-xl">
                    <BookOpen aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {resource.title}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {resource.type}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No resources shared yet"
              detail="Shared educator resources will appear here."
            />
          ))}
        {active === "about" && (
          <section className="bg-card rounded-xl border p-6">
            <h2 className="font-serif text-xl">
              About {displayName.split(" ")[0]}
            </h2>
            <p className="text-foreground/80 mt-3 text-sm leading-6">
              {bio || "This educator has not added a bio yet."}
            </p>
            <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
              {details.map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {value || "Not provided"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof FileText;
  title: string;
  detail: string;
}) {
  return (
    <section className="bg-card rounded-xl border p-9 text-center">
      <Icon
        aria-hidden="true"
        className="text-muted-foreground/40 mx-auto size-8"
      />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </section>
  );
}
