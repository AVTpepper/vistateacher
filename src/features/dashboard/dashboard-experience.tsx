import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Clock3,
  Download,
  Eye,
  Heart,
  LayoutDashboard,
  Lock,
  MessageCircle,
  MessageSquareText,
  Sparkles,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";

import { UserAvatar } from "@/components/ui/user-avatar";
import { FollowButton } from "@/features/network/follow-button";
import { LazyDashboardCharts } from "@/features/dashboard/lazy-dashboard-charts";
import type { DashboardData, DashboardQuota } from "@/lib/dashboard/server";

function QuotaRow({ quota }: { quota: DashboardQuota }) {
  const unlimited = quota.limit === null;
  const plusOnly = quota.limit === 0;
  let percentage = 0;
  if (plusOnly) percentage = 100;
  else if (quota.limit !== null)
    percentage = Math.min(100, (quota.used / quota.limit) * 100);
  return (
    <Link href={quota.href} className="group block py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="group-hover:text-primary font-bold">
          {quota.label}
        </span>
        <span className="text-muted-foreground">
          {unlimited
            ? "Unlimited"
            : plusOnly
              ? "Plus"
              : `${quota.used} / ${quota.limit}`}
        </span>
      </div>
      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${plusOnly ? "bg-accent/40" : percentage >= 90 ? "bg-accent" : "bg-primary"}`}
          style={{ width: unlimited ? "100%" : `${percentage}%` }}
        />
      </div>
    </Link>
  );
}

function SectionHeading({
  title,
  href,
  action,
}: {
  title: string;
  href: string;
  action: string;
}) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <h2 className="min-w-0 font-serif text-lg break-words">{title}</h2>
      <Link
        href={href}
        className="text-primary flex shrink-0 items-center gap-1 text-xs font-bold hover:underline"
      >
        {action} <ArrowRight aria-hidden="true" className="size-3" />
      </Link>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">{children}</p>
  );
}

export function DashboardExperience({
  dashboard,
}: {
  dashboard: DashboardData;
}) {
  const summary = dashboard.analytics.summary;
  const insight = dashboard.recommendations.resources[0]
    ? `${dashboard.recommendations.resources[0].title} matches your teaching interests.`
    : dashboard.recommendations.discussions[0]
      ? `A new discussion in ${dashboard.recommendations.discussions[0].category.name} is active now.`
      : "Your teaching workspace is ready for the next idea.";
  const metrics = [
    {
      label: "Profile views",
      value: summary.profileViews,
      icon: Eye,
      tone: "text-primary bg-primary/10",
      href: "/profile/views",
    },
    {
      label: "Post engagement",
      value: summary.postEngagements,
      icon: Heart,
      tone: "text-destructive bg-destructive/10",
      href: `/profile/${dashboard.viewer.uid}?tab=posts`,
    },
    {
      label: "Resource downloads",
      value: summary.resourceDownloadsTotal,
      icon: Download,
      tone: "text-accent-readable bg-accent/10",
      href: `/profile/${dashboard.viewer.uid}?tab=resources`,
    },
    {
      label: "Forum contributions",
      value: summary.forumContributions,
      icon: MessageCircle,
      tone: "text-success bg-success/10",
      href: "/forum",
    },
    {
      label: "Lessons generated",
      value: summary.lessonsGeneratedTotal,
      icon: Sparkles,
      tone: "text-violet bg-violet/10",
      href: "/ai-lessons",
    },
  ];

  return (
    <div
      data-testid="dashboard"
      className="mx-auto w-full max-w-6xl min-w-0 space-y-5 px-4 py-6 lg:px-6"
    >
      <section className="bg-sidebar relative max-w-full min-w-0 overflow-hidden rounded-xl px-4 py-6 text-white sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar
            name={dashboard.viewer.displayName}
            photoURL={dashboard.viewer.photoURL}
            className="size-14 rounded-xl text-base ring-2 ring-white/20"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-2xl">
              Welcome back, {dashboard.viewer.firstName}.
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/80">
              {insight}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap gap-2 sm:shrink-0">
            <Link
              href="/ai-lessons"
              className="flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold hover:bg-white/20"
            >
              <Sparkles className="text-accent-readable size-3.5" />
              Build a lesson
            </Link>
            <Link
              href="/discover"
              className="flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold hover:bg-white/20"
            >
              <UserPlus className="size-3.5" />
              Find teachers
            </Link>
          </div>
        </div>
      </section>

      <nav
        aria-label="Dashboard quick actions"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          {
            href: "/ai-lessons",
            label: "Build a lesson",
            detail: "Structured AI planning",
            icon: Sparkles,
            tone: "text-accent-readable bg-accent/10",
          },
          {
            href: "/resources/new",
            label: "Share a resource",
            detail: "Support other teachers",
            icon: BookOpen,
            tone: "text-primary bg-primary/10",
          },
          {
            href: "/forum/new",
            label: "Start a discussion",
            detail: "Learn with the community",
            icon: MessageSquareText,
            tone: "text-success bg-success/10",
          },
          {
            href: "/network?view=suggestions",
            label: "Grow your network",
            detail: "Relevant connections",
            icon: Users,
            tone: "text-violet bg-violet/10",
          },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="surface-card surface-card-interactive group max-w-full min-w-0 p-3 sm:p-4"
            >
              <span
                className={`grid size-9 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${action.tone}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="mt-3 block text-sm font-bold break-words">
                {action.label}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs break-words">
                {action.detail}
              </span>
            </Link>
          );
        })}
      </nav>

      {dashboard.actionItems.length > 0 && (
        <section
          className="surface-card max-w-full min-w-0 p-4 sm:p-5"
          aria-labelledby="action-center-heading"
        >
          <div className="mb-4">
            <h2 id="action-center-heading" className="font-serif text-xl">
              Action center
            </h2>
            <p className="text-muted-foreground text-xs">
              Small next steps to finish your work and improve visibility.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dashboard.actionItems.map((item) => {
              const Icon = item.kind === "notification" ? Bell : WandSparkles;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="bg-muted/35 hover:border-primary/25 flex min-w-0 items-start gap-3 rounded-lg border p-4"
                >
                  <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-bold">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-5">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight className="text-muted-foreground mt-1 size-3.5 shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="analytics-heading">
        <div className="mb-3 flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="analytics-heading" className="font-serif text-xl">
              Your analytics
            </h2>
            <p className="text-muted-foreground text-xs">
              Trusted aggregate activity, updated by VistaTeacher.
            </p>
          </div>
          <span
            className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${dashboard.plan === "plus" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {dashboard.plan}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link
                key={metric.label}
                href={metric.href}
                className="surface-card surface-card-interactive max-w-full min-w-0 p-3 sm:p-4"
              >
                <span
                  className={`grid size-8 place-items-center rounded-lg ${metric.tone}`}
                >
                  <Icon className="size-4" />
                </span>
                <p className="mt-3 text-2xl font-bold">
                  {metric.value.toLocaleString()}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {metric.label}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="surface-card max-w-full min-w-0 p-4 sm:p-5">
        <SectionHeading
          title="Teachers you might know"
          href="/network?view=suggestions"
          action="See all"
        />
        <div className="divide-y">
          {dashboard.recommendations.educators.length ? (
            dashboard.recommendations.educators.map(
              ({ profile, connectionStatus, connectionDirection }) => (
                <div
                  key={profile.uid}
                  className="flex max-w-full min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Link href={`/profile/${profile.uid}`}>
                    <UserAvatar
                      name={profile.displayName}
                      photoURL={profile.photoURL}
                      className="size-10 rounded-full text-xs"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/profile/${profile.uid}`}
                      className="hover:text-primary block truncate text-sm font-bold"
                    >
                      {profile.displayName}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {profile.gradeLevel} · {profile.subjects[0]}
                    </p>
                  </div>
                  <FollowButton
                    targetUid={profile.uid}
                    connectionStatus={connectionStatus}
                    connectionDirection={connectionDirection}
                    mode="connect"
                    className="shrink-0 whitespace-nowrap"
                  />
                </div>
              ),
            )
          ) : (
            <EmptyLine>
              More suggestions will appear as the community grows.
            </EmptyLine>
          )}
        </div>
      </section>

      <div className="grid max-w-full min-w-0 gap-5 lg:grid-cols-2">
        <section className="surface-card max-w-full min-w-0 p-4 sm:p-5">
          <SectionHeading
            title="Recommended resources"
            href="/resources"
            action="Browse all"
          />
          <div className="divide-y">
            {dashboard.recommendations.resources.length ? (
              dashboard.recommendations.resources.map((resource) => (
                <Link
                  key={resource.id}
                  href={`/resources/${resource.id}`}
                  className="group flex max-w-full min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="bg-primary/10 grid size-10 shrink-0 place-items-center rounded-lg">
                    <BookOpen className="text-primary size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="group-hover:text-primary block truncate text-sm font-bold">
                      {resource.title}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {resource.author.displayName} · {resource.gradeLevel}
                    </span>
                  </span>
                  <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                    <Star className="text-amber fill-amber size-3" />
                    {resource.ratingAverage.toFixed(1)}
                  </span>
                </Link>
              ))
            ) : (
              <EmptyLine>New recommendations are on the way.</EmptyLine>
            )}
          </div>
        </section>

        <section className="surface-card max-w-full min-w-0 p-4 sm:p-5">
          <SectionHeading
            title="Hot in the forum"
            href="/forum"
            action="Go to forum"
          />
          <div className="divide-y">
            {dashboard.recommendations.discussions.length ? (
              dashboard.recommendations.discussions.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/forum/${thread.id}`}
                  className="group block py-3 first:pt-0 last:pb-0"
                >
                  <span className="group-hover:text-primary line-clamp-2 text-sm font-bold">
                    {thread.title}
                  </span>
                  <span className="text-muted-foreground mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1">
                      <MessageCircle className="size-3" />
                      {thread.replyCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" />
                      {thread.likeCount}
                    </span>
                    <span className="bg-muted max-w-full min-w-0 truncate rounded px-1.5 py-0.5 text-[10px]">
                      {thread.category.name}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <EmptyLine>No active discussions yet.</EmptyLine>
            )}
          </div>
        </section>
      </div>

      <section className="surface-card max-w-full min-w-0 p-4 sm:p-5">
        <SectionHeading
          title="Posts you might like"
          href="/app"
          action="Full feed"
        />
        <div className="grid gap-4 md:grid-cols-3">
          {dashboard.recommendations.posts.length ? (
            dashboard.recommendations.posts.map((post) => (
              <Link
                key={post.id}
                href={`/post/${post.id}`}
                className="bg-muted/35 hover:border-primary/20 max-w-full min-w-0 rounded-lg border p-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar
                    name={post.author.displayName}
                    photoURL={post.author.photoURL}
                    className="size-7 rounded-full text-[9px]"
                  />
                  <span className="truncate text-xs font-bold">
                    {post.author.displayName}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6">
                  {post.content}
                </p>
                <div className="text-muted-foreground mt-3 flex gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <Heart className="size-3" />
                    {post.likeCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3" />
                    {post.commentCount}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <EmptyLine>Follow educators to personalize your feed.</EmptyLine>
          )}
        </div>
      </section>

      {dashboard.topResources.length > 0 && (
        <section className="surface-card max-w-full min-w-0 p-4 sm:p-5">
          <SectionHeading
            title="Your top resources"
            href="/resources"
            action="Manage resources"
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.topResources.map((resource, index) => (
              <Link
                key={resource.id}
                href={`/resources/${resource.id}`}
                className="bg-muted/35 flex min-w-0 items-center gap-3 overflow-hidden rounded-lg p-3"
              >
                <span
                  className={`font-serif text-2xl font-bold ${index === 0 ? "text-accent-readable" : "text-muted-foreground"}`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="line-clamp-2 text-sm leading-5 font-bold break-words">
                    {resource.title}
                  </span>
                  <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                    <TrendingUp className="size-3" />
                    {resource.downloadCount.toLocaleString()} downloads
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section
        className="surface-card max-w-full min-w-0 p-4 sm:p-5"
        aria-label="Analytics trends"
      >
        <div className="mb-5 flex items-center gap-2">
          <BarChart3 className="text-primary size-4" />
          <h2 className="font-serif text-lg">Performance trends</h2>
        </div>
        {dashboard.analytics.fullAnalytics && dashboard.analytics.series ? (
          <LazyDashboardCharts series={dashboard.analytics.series} />
        ) : (
          <div className="bg-muted/35 grid h-72 place-items-center rounded-lg border border-dashed p-6 text-center">
            <div>
              <span className="bg-accent/10 mx-auto grid size-11 place-items-center rounded-lg">
                <Lock className="text-accent-readable size-5" />
              </span>
              <h3 className="mt-3 text-sm font-bold">Plus analytics</h3>
              <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs leading-5">
                Unlock audience, download, and engagement trends from your
                aggregate activity.
              </p>
              <Link
                href="/settings/billing"
                className="text-primary mt-3 inline-block text-xs font-bold hover:underline"
              >
                View Plus plans
              </Link>
            </div>
          </div>
        )}
      </section>

      <section className="surface-card mx-auto max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg">Plan and usage</h2>
            <p className="text-muted-foreground text-xs">
              {dashboard.plan === "plus"
                ? "Plus membership"
                : "Community membership"}
            </p>
          </div>
          <LayoutDashboard className="text-primary size-5" />
        </div>
        <div className="grid gap-3">
          {dashboard.quotas.map((quota) => (
            <QuotaRow key={quota.label} quota={quota} />
          ))}
        </div>
        {dashboard.plan === "free" && (
          <Link
            href="/settings/billing"
            className="bg-accent text-accent-foreground mt-5 flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-bold"
          >
            <Sparkles className="size-4" />
            Upgrade to Plus
          </Link>
        )}
        {dashboard.plan === "plus" && (
          <Link
            href="/settings/billing"
            className="text-primary mt-5 flex h-10 items-center justify-center rounded-lg border text-xs font-bold"
          >
            Manage plan
          </Link>
        )}
        {dashboard.subscription.cancelAtPeriodEnd && (
          <p className="text-accent-readable mt-4 flex items-start gap-2 text-xs">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            Your plan remains active until the current period ends.
          </p>
        )}
      </section>
    </div>
  );
}
