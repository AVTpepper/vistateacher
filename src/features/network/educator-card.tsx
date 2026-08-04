import { MapPin, School } from "lucide-react";
import Link from "next/link";

import { UserAvatar } from "@/components/ui/user-avatar";
import { FollowButton } from "@/features/network/follow-button";
import type { EducatorDiscoveryResult } from "@/lib/network/server";

export function EducatorCard({
  result,
  viewerUid,
}: {
  result: EducatorDiscoveryResult;
  viewerUid: string;
}) {
  const { profile, isFollowing } = result;
  return (
    <article className="bg-card group hover:border-primary/20 overflow-hidden rounded-2xl border transition-[border-color,box-shadow] hover:shadow-md">
      <div className="from-primary/20 to-sidebar-primary/20 relative h-24 bg-gradient-to-br">
        <div className="absolute bottom-0 left-4 translate-y-1/2">
          <div className="relative">
            <UserAvatar
              name={profile.displayName}
              photoURL={profile.photoURL}
              className="ring-card size-14 rounded-full text-sm ring-3"
            />
            {profile.isVerified && (
              <span
                aria-label="Verified educator"
                className="bg-primary ring-card absolute right-0 bottom-0 grid size-5 place-items-center rounded-full text-[9px] font-bold text-white ring-2"
              >
                ✓
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="p-4 pt-9">
        <Link
          href={`/profile/${profile.uid}`}
          className="group-hover:text-primary text-sm font-bold transition-colors"
        >
          {profile.displayName}
        </Link>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          {profile.gradeLevel} · {profile.subjects.join(", ")}
        </p>
        <div className="text-muted-foreground mt-3 space-y-1 text-xs">
          <p className="flex items-center gap-1.5">
            <School aria-hidden="true" className="size-3" />
            <span className="truncate">
              {profile.school || "School not listed"}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-3" />
            <span className="truncate">
              {[profile.city, profile.country].filter(Boolean).join(", ")}
            </span>
          </p>
        </div>
        <p className="text-foreground/70 mt-3 line-clamp-2 min-h-10 text-xs leading-5">
          {profile.bio || "This educator has not added a bio yet."}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            [profile.followerCount, "Followers"],
            [profile.resourceCount, "Resources"],
            [profile.postCount, "Posts"],
          ].map(([value, label]) => (
            <div className="bg-muted/50 rounded-lg py-1.5" key={label}>
              <dt className="text-sm font-bold">
                {Number(value).toLocaleString()}
              </dt>
              <dd className="text-muted-foreground text-[10px]">{label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {profile.uid === viewerUid ? (
            <span className="bg-muted text-muted-foreground flex h-9 items-center justify-center rounded-xl text-xs font-semibold">
              You
            </span>
          ) : (
            <FollowButton
              targetUid={profile.uid}
              initialFollowing={isFollowing}
            />
          )}
          <Link
            href={`/profile/${profile.uid}`}
            className="hover:bg-muted flex h-9 items-center justify-center rounded-xl border text-xs font-semibold"
          >
            View profile
          </Link>
        </div>
      </div>
    </article>
  );
}
