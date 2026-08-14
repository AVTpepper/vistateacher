import {
  BookOpen,
  Calendar,
  Edit,
  FileText,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
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
import type { FeedPost } from "@/lib/feed/server";
import { coverThemeById, resolveCoverTheme } from "@/lib/profiles/cover-themes";
import type { ProfileView as ProfileViewData } from "@/lib/profiles/server";

export function ProfileView({
  data,
  activeTab,
  postCount,
  posts,
  profileBasePath = "/profile",
  resourceCount,
  resources,
  viewer,
}: {
  data: ProfileViewData;
  activeTab: "about" | "resources" | "posts";
  postCount: number;
  posts: FeedPost[];
  profileBasePath?: "/profile" | "/educators";
  resourceCount: number;
  resources: Array<{ id: string; title: string; type: string }>;
  viewer: { uid: string; displayName: string; photoURL: string | null };
}) {
  const { profile } = data;
  const profileHref = `${profileBasePath}/${encodeURIComponent(profile.uid)}`;
  const coverTheme = coverThemeById(resolveCoverTheme(profile.coverTheme));
  const location = [profile.city, profile.country].filter(Boolean).join(", ");
  const stats = [
    {
      icon: Users,
      value: profile.connectionCount,
      label: "Connections",
      href: `/network?view=connections&uid=${encodeURIComponent(profile.uid)}&scope=shared`,
    },
    {
      icon: BookOpen,
      value: resourceCount,
      label: "Resources",
      href: `${profileHref}?tab=resources#profile-content`,
    },
    {
      icon: FileText,
      value: postCount,
      label: "Posts",
      href: `${profileHref}?tab=posts#profile-content`,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div
        className="relative mb-4 h-44 overflow-hidden rounded-2xl"
        style={{ background: coverTheme.background }}
      >
        <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
      </div>
      <section className="surface-card relative -mt-12 rounded-2xl p-5 sm:p-6">
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
                  {profile.professionalRoles.join(", ")}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {profile.gradeLevel} · {profile.subjects.join(", ")}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {data.plan === "plus" && (
                  <span className="bg-accent/10 text-accent inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide">
                    Plus
                  </span>
                )}
                {data.isOwner ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/settings/profile">
                      <Edit aria-hidden="true" />
                      Edit profile
                    </Link>
                  </Button>
                ) : data.connectionStatus === null ? (
                  <>
                    <Button asChild size="sm">
                      <Link href="/sign-in">
                        <UserPlus aria-hidden="true" />
                        Sign in to connect
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/sign-in">
                        <MessageCircle aria-hidden="true" />
                        Sign in to message
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <FollowButton
                      targetUid={profile.uid}
                      connectionStatus={data.connectionStatus}
                      connectionDirection={data.connectionDirection}
                      mode="connect"
                    />
                    {data.connectionStatus === "accepted" ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/messages?compose=${encodeURIComponent(profile.uid)}`}
                        >
                          <MessageCircle aria-hidden="true" />
                          Message
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        disabled
                        size="sm"
                        variant="outline"
                        title={`Connect with ${profile.displayName} to send a message.`}
                      >
                        <MessageCircle aria-hidden="true" />
                        Message
                      </Button>
                    )}
                  </>
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
        <p className="text-foreground mt-4 max-w-2xl text-sm leading-6">
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
        <div
          aria-label="Profile statistics"
          className="mt-5 grid grid-cols-3 gap-2 border-t pt-5"
        >
          {stats.map(({ icon: Icon, value, label, href }) => (
            <Link
              aria-label={`View ${profile.displayName}'s ${label.toLowerCase()}`}
              className="hover:bg-muted focus-visible:ring-ring rounded-xl px-2 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
              href={href}
              key={label}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Icon aria-hidden="true" className="text-primary size-3.5" />
                <span className="text-lg font-bold">
                  {value.toLocaleString()}
                </span>
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <ProfileTabs
        active={activeTab}
        profileBasePath={profileBasePath}
        profileUid={profile.uid}
        displayName={profile.displayName}
        bio={profile.bio}
        posts={posts}
        resources={resources}
        viewer={viewer}
        details={[
          { label: "Roles", value: profile.professionalRoles.join(", ") },
          {
            label: "Subjects and expertise",
            value: profile.subjects.join(", "),
          },
          ...(profile.languages.length
            ? [
                {
                  label: "Languages taught",
                  value: profile.languages.join(", "),
                },
              ]
            : []),
          { label: "Education stage", value: profile.gradeLevel },
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
