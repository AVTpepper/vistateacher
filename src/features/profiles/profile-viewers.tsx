import { Eye } from "lucide-react";
import Link from "next/link";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { ProfileViewer } from "@/lib/profiles/server";

export function ProfileViewers({ viewers }: { viewers: ProfileViewer[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-6">
      <header>
        <h1 className="font-serif text-3xl">Profile views</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Educators who have viewed your profile. Each person is counted once.
        </p>
      </header>
      <section
        className="surface-card overflow-hidden"
        aria-label="Profile viewers"
      >
        {viewers.length ? (
          <div className="divide-y">
            {viewers.map((viewer) => (
              <Link
                key={viewer.uid}
                href={`/profile/${encodeURIComponent(viewer.uid)}`}
                className="hover:bg-muted/50 flex items-center gap-3 p-4 transition-colors"
              >
                <UserAvatar
                  name={viewer.displayName}
                  photoURL={viewer.photoURL}
                  className="size-11 rounded-full text-xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {viewer.displayName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {viewer.professionalRoles.join(", ") || "Educator"}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {new Date(viewer.viewedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <Eye className="text-muted-foreground/35 mx-auto size-8" />
            <h2 className="mt-3 font-serif text-xl">No profile views yet</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              New viewers will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
