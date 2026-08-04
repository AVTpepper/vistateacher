import {
  BookOpen,
  Calendar,
  Edit,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  School,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FollowButton } from "@/features/network/follow-button";
import { ProfileTabs } from "@/features/profiles/profile-tabs";
import type { ProfileView as ProfileViewData } from "@/lib/profiles/server";

export function ProfileView({
  data,
  resources,
}: {
  data: ProfileViewData;
  resources: Array<{ id: string; title: string; type: string }>;
}) {
  const { profile } = data;
  const location = [profile.city, profile.country].filter(Boolean).join(", ");
  const stats = [
    {
      icon: Users,
      value: profile.followerCount,
      label: "Followers",
      href: `/network?view=followers&uid=${profile.uid}`,
    },
    {
      icon: UserPlus,
      value: profile.followingCount,
      label: "Following",
      href: `/network?view=following&uid=${profile.uid}`,
    },
    {
      icon: BookOpen,
      value: profile.resourceCount,
      label: "Resources",
      href: null,
    },
    { icon: FileText, value: profile.postCount, label: "Posts", href: null },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="from-primary/30 to-sidebar-primary/30 relative mb-4 h-44 overflow-hidden rounded-2xl bg-gradient-to-br">
        {profile.coverImageURL && (
          // Profile covers use runtime Firebase Storage origins.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.coverImageURL}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>
      <section className="bg-card relative -mt-12 rounded-2xl border p-5 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="relative z-10 shrink-0">
            <UserAvatar
              name={profile.displayName}
              photoURL={profile.photoURL}
              className="ring-card size-20 rounded-2xl text-xl shadow-lg ring-4"
            />
            {profile.isVerified && (
              <span
                aria-label="Verified educator"
                className="bg-primary ring-card absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2"
              >
                ✓
              </span>
            )}
          </div>
          <div className="mt-1 min-w-0 flex-1 sm:mt-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-serif text-2xl">{profile.displayName}</h1>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {profile.gradeLevel} · {profile.subjects.join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {data.plan === "plus" && (
                  <span className="bg-accent/10 text-accent rounded-full px-2.5 py-1 text-xs font-bold">
                    ✦ Plus
                  </span>
                )}
                {data.isOwner ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/settings/profile">
                      <Edit aria-hidden="true" />
                      Edit profile
                    </Link>
                  </Button>
                ) : data.isFollowing === null ? (
                  <Button asChild size="sm">
                    <Link href="/sign-in">
                      <UserPlus aria-hidden="true" />
                      Sign in to follow
                    </Link>
                  </Button>
                ) : (
                  <FollowButton
                    targetUid={profile.uid}
                    initialFollowing={data.isFollowing}
                  />
                )}
              </div>
            </div>
            <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {profile.school && (
                <span className="flex items-center gap-1.5">
                  <School aria-hidden="true" className="size-3" />
                  {profile.school}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-3" />
                {location}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar aria-hidden="true" className="size-3" />
                Joined {data.joinedLabel}
              </span>
              {profile.website && (
                <a
                  className="text-primary flex items-center gap-1.5 hover:underline"
                  href={profile.website}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Globe aria-hidden="true" className="size-3" />
                  Website
                </a>
              )}
            </div>
          </div>
        </div>
        <p className="text-foreground/80 mt-4 max-w-2xl text-sm leading-6">
          {profile.bio || "This educator has not added a bio yet."}
        </p>
        {data.contactDetails &&
          (data.contactDetails.professionalEmail ||
            data.contactDetails.phone) && (
            <div className="bg-muted mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-xl px-4 py-3 text-xs">
              {data.contactDetails.professionalEmail && (
                <a
                  className="text-primary flex items-center gap-1.5 hover:underline"
                  href={`mailto:${data.contactDetails.professionalEmail}`}
                >
                  <Mail aria-hidden="true" className="size-3.5" />
                  {data.contactDetails.professionalEmail}
                </a>
              )}
              {data.contactDetails.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone aria-hidden="true" className="size-3.5" />
                  {data.contactDetails.phone}
                </span>
              )}
            </div>
          )}
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-5 sm:grid-cols-4">
          {stats.map(({ icon: Icon, value, label, href }) => (
            <div className="text-center" key={label}>
              <dt className="flex items-center justify-center gap-1.5">
                <Icon aria-hidden="true" className="text-primary size-3.5" />
                <span className="text-lg font-bold">
                  {value.toLocaleString()}
                </span>
              </dt>
              <dd className="text-muted-foreground text-xs">
                {href ? (
                  <Link
                    href={href}
                    className="hover:text-primary hover:underline"
                  >
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <ProfileTabs
        displayName={profile.displayName}
        bio={profile.bio}
        resources={resources}
        details={[
          { label: "Subjects", value: profile.subjects.join(", ") },
          { label: "Grade Level", value: profile.gradeLevel },
          { label: "School", value: profile.school },
          { label: "Location", value: location },
          { label: "Experience", value: `${profile.yearsOfExperience} years` },
          {
            label: "Plan",
            value: data.plan === "plus" ? "Plus member" : "Community account",
          },
        ]}
      />
    </div>
  );
}
