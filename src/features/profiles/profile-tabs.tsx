"use client";

import { BookOpen, FileText, Users } from "lucide-react";
import Link from "next/link";

import { ProfilePostList } from "@/features/profiles/profile-post-list";
import {
  ProfileTabButton,
  useProfileTabs,
} from "@/features/profiles/profile-tab-context";
import type { FeedPost } from "@/lib/feed/server";
import { cn } from "@/lib/utils";

export function ProfileTabs({
  displayName,
  bio,
  details,
  posts,
  resources,
  viewer,
}: {
  displayName: string;
  bio: string;
  details: Array<{ label: string; value: string }>;
  posts: FeedPost[];
  resources: Array<{ id: string; title: string; type: string }>;
  viewer: { uid: string; displayName: string; photoURL: string | null };
}) {
  const { activeTab } = useProfileTabs();
  const tabs = [
    { key: "about" as const, label: "About", icon: Users },
    { key: "resources" as const, label: "Resources", icon: BookOpen },
    { key: "posts" as const, label: "Posts", icon: FileText },
  ];
  return (
    <>
      <nav
        id="profile-content"
        aria-label="Profile sections"
        className="surface-card mt-4 flex gap-1 p-1 [overflow-anchor:none]"
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <ProfileTabButton
            key={key}
            tab={key}
            ariaCurrent={activeTab === key ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-muted flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
              activeTab === key &&
                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <span>
              <Icon aria-hidden="true" className="mr-2 inline size-3.5" />
              {label}
            </span>
          </ProfileTabButton>
        ))}
      </nav>

      <div className="mt-4 [overflow-anchor:none]">
        {activeTab === "posts" &&
          (posts.length ? (
            <ProfilePostList initialPosts={posts} viewer={viewer} />
          ) : (
            <EmptyState
              icon={FileText}
              title={`No posts from ${displayName} yet`}
              detail="Published community posts will appear here."
            />
          ))}
        {activeTab === "resources" &&
          (resources.length ? (
            <div className="space-y-3">
              {resources.map((resource) => (
                <Link
                  href={`/resources/${resource.id}`}
                  key={resource.id}
                  className="surface-card surface-card-interactive flex items-center gap-4 p-4"
                >
                  <span className="bg-secondary text-primary grid size-12 shrink-0 place-items-center rounded-xl">
                    <BookOpen aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {resource.title}
                    </span>
                    <span className="bg-accent text-accent-foreground mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize">
                      {resource.type.replace("-", " ")}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No resources shared yet"
              detail="Shared educator resources will appear here."
            />
          ))}
        {activeTab === "about" && (
          <section className="surface-card p-6">
            <h2 className="font-serif text-xl">
              About {displayName.split(" ")[0]}
            </h2>
            <p className="text-foreground mt-3 text-sm leading-6">
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
    <section className="surface-card p-9 text-center">
      <Icon
        aria-hidden="true"
        className="text-muted-foreground/40 mx-auto size-8"
      />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </section>
  );
}
