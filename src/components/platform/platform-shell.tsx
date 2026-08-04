"use client";

import {
  Bell,
  BookOpen,
  ChevronLeft,
  Compass,
  GraduationCap,
  Home,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquare,
  ShieldCheck,
  Settings,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { LogoutButton } from "@/features/auth/logout-button";
import { GlobalSearch } from "@/features/search/global-search";
import { cn } from "@/lib/utils";
import type { Plan } from "@/types/models";
import type { UserRole } from "@/types/models";

const navigation = [
  { label: "Home Feed", icon: Home, href: "/app" },
  { label: "Discover", icon: Compass, href: "/discover" },
  { label: "Network", icon: UsersRound, href: "/network" },
  { label: "Resources", icon: BookOpen, href: "/resources" },
  { label: "Forum", icon: MessageSquare, href: "/forum" },
  {
    label: "AI Lesson Builder",
    icon: Sparkles,
    href: "/ai-lessons",
    plus: true,
  },
  { label: "Messages", icon: Mail, href: "/messages" },
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
];

interface PlatformShellProps {
  account: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    subject: string;
  };
  plan: Plan;
  children: React.ReactNode;
}

export function PlatformShell({ account, plan, children }: PlatformShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "border-sidebar-border flex h-16 items-center gap-3 border-b px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <span className="bg-sidebar-primary grid size-9 shrink-0 place-items-center rounded-xl text-white">
          <GraduationCap aria-hidden="true" className="size-5" />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-serif text-base text-white">
              VistaTeacher
            </p>
            {plan === "plus" && (
              <span className="bg-accent mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold text-white">
                PLUS
              </span>
            )}
          </div>
        )}
      </div>
      <nav
        aria-label="Platform navigation"
        className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4"
      >
        {navigation.map(({ label, icon: Icon, href, plus }) => {
          const active =
            pathname === href ||
            (href !== "/app" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                active
                  ? "bg-white/12 text-white"
                  : "text-white/60 hover:bg-white/8 hover:text-white",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-[18px] shrink-0",
                  active && "text-sidebar-primary",
                )}
              />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {plus && (
                    <span className="bg-accent/20 text-accent rounded px-1.5 py-0.5 text-[9px]">
                      Plus
                    </span>
                  )}
                </>
              )}
              {active && (
                <span className="bg-sidebar-primary absolute top-2 right-0 h-6 w-0.5 rounded-l" />
              )}
            </Link>
          );
        })}
        {account.role === "platform_admin" && (
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? "Administration" : undefined}
            className={cn(
              "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
              pathname.startsWith("/admin")
                ? "bg-white/12 text-white"
                : "text-white/60 hover:bg-white/8 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <ShieldCheck className="size-[18px] shrink-0" />
            {!collapsed && <span>Administration</span>}
          </Link>
        )}
      </nav>
      {plan === "free" && !collapsed && (
        <div className="mx-3 mb-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Sparkles aria-hidden="true" className="text-accent size-3.5" />
            Upgrade to Plus
          </p>
          <p className="mt-1 text-[11px] leading-4 text-white/50">
            AI tools and expanded limits.
          </p>
          <Link
            href="/pricing"
            className="bg-accent mt-2.5 block rounded-lg py-1.5 text-center text-xs font-bold text-white"
          >
            See plans
          </Link>
        </div>
      )}
      <div className="border-sidebar-border border-t p-3">
        <Link
          href={`/profile/${account.uid}`}
          className={cn(
            "flex items-center gap-3 rounded-xl p-2 hover:bg-white/8",
            collapsed && "justify-center",
          )}
        >
          <UserAvatar
            name={account.displayName}
            photoURL={account.photoURL}
            className="size-8 shrink-0 rounded-full text-[10px] ring-2 ring-white/10"
          />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">
                {account.displayName}
              </span>
              <span className="block truncate text-xs text-white/40">
                {account.subject}
              </span>
            </span>
          )}
        </Link>
        <div className={cn("mt-1 flex gap-1", collapsed && "flex-col")}>
          <Link
            href="/settings"
            title="Settings"
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs text-white/40 hover:bg-white/8 hover:text-white/75"
          >
            <Settings aria-hidden="true" className="size-3.5" />
            {!collapsed && "Settings"}
          </Link>
          <LogoutButton compact={collapsed} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="mb-2 hidden h-8 items-center justify-center rounded-lg text-white/30 hover:bg-white/8 hover:text-white/60 lg:mx-3 lg:flex"
      >
        <ChevronLeft
          aria-hidden="true"
          className={cn(
            "size-4 transition-transform",
            collapsed && "rotate-180",
          )}
        />
      </button>
    </div>
  );

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <aside
        className={cn(
          "bg-sidebar hidden h-full shrink-0 transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebar}
      </aside>
      <div
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={cn(
          "bg-sidebar fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-4 z-10 grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="bg-card flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-muted-foreground hover:bg-muted grid size-9 shrink-0 place-items-center rounded-xl lg:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <Link
            href="/app"
            className="flex shrink-0 items-center gap-2 lg:hidden"
          >
            <span className="bg-primary grid size-7 place-items-center rounded-lg text-white">
              <GraduationCap aria-hidden="true" className="size-4" />
            </span>
            <span className="hidden font-serif text-sm sm:inline">
              VistaTeacher
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="text-muted-foreground hover:bg-muted hover:text-foreground relative grid size-9 shrink-0 place-items-center rounded-xl"
          >
            <Bell aria-hidden="true" className="size-[18px]" />
          </Link>
          <Link href={`/profile/${account.uid}`} aria-label="My profile">
            <UserAvatar
              name={account.displayName}
              photoURL={account.photoURL}
              className="ring-border size-9 rounded-xl text-xs ring-2"
            />
          </Link>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
