"use client";

import {
  BookOpen,
  Compass,
  Home,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { LogoutButton } from "@/features/auth/logout-button";
import { NotificationMenu } from "@/features/notifications/notification-menu";
import { PresenceHeartbeat } from "@/features/presence/presence-heartbeat";
import { GlobalSearch } from "@/features/search/global-search";
import { cn } from "@/lib/utils";
import type { Plan } from "@/types/models";
import type { UserRole } from "@/types/models";

const primaryNavigation = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Feed", icon: Home, href: "/app" },
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
] as const;

interface PlatformShellProps {
  account: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    role: UserRole;
    onboarded: boolean;
    subject: string;
  };
  plan: Plan;
  children: React.ReactNode;
}

export function PlatformShell({ account, plan, children }: PlatformShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileHref = account.onboarded ? "/profile" : "/onboarding";
  const immersiveMessages = pathname.startsWith("/messages");
  const closeMobileMenu = () => setMobileOpen(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const trigger = mobileTriggerRef.current;
    root.style.overflow = "hidden";
    const drawer = mobileDrawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [userMenuOpen]);

  const mobileMenu = (
    <div className="p-3">
      <div className="border-accent mb-3 border-b pb-3">
        <GlobalSearch enableShortcut={false} onOpen={closeMobileMenu} />
      </div>
      <nav
        aria-label="Platform navigation"
        className="grid max-h-[calc(100dvh-5rem)] gap-1 overflow-y-auto"
      >
        {primaryNavigation.map(({ label, icon: Icon, href, ...item }) => {
          const active =
            pathname === href ||
            (href !== "/app" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={closeMobileMenu}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                active
                  ? "border-accent bg-accent/15 border-r-[3px] text-white"
                  : "text-white/75 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4.5 shrink-0",
                  active && "text-accent-readable",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {"plus" in item && item.plus && (
                <span className="bg-accent/20 rounded px-1.5 py-0.5 text-[9px] font-bold text-[#ffc4bc]">
                  Plus
                </span>
              )}
            </Link>
          );
        })}
        {account.role === "platform_admin" && (
          <Link
            href="/admin"
            aria-current={pathname.startsWith("/admin") ? "page" : undefined}
            onClick={closeMobileMenu}
            className={cn(
              "relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
              pathname.startsWith("/admin")
                ? "bg-white/12 text-white"
                : "text-white/75 hover:bg-white/8 hover:text-white",
            )}
          >
            <ShieldCheck aria-hidden="true" className="size-4.5 shrink-0" />
            <span>Administration</span>
          </Link>
        )}
      </nav>
    </div>
  );

  return (
    <div className="platform-shell bg-background flex min-h-dvh flex-col">
      <PresenceHeartbeat />
      <div
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-x-0 top-16 bottom-0 z-40 bg-black/50 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        ref={mobileDrawerRef}
        id="platform-mobile-navigation"
        aria-hidden={!mobileOpen}
        aria-label="Platform menu"
        aria-modal="true"
        inert={!mobileOpen}
        role="dialog"
        className={cn(
          "bg-sidebar fixed top-16 left-0 z-50 max-h-[calc(100dvh-4rem)] w-[calc(100vw-3rem)] max-w-80 overflow-hidden rounded-br-lg shadow-2xl transition-[transform,opacity] duration-200 lg:hidden",
          mobileOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0",
        )}
      >
        {mobileMenu}
      </aside>
      <header className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 z-30 shrink-0 border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <button
              ref={mobileTriggerRef}
              type="button"
              onClick={() => {
                setMobileOpen((value) => !value);
                setUserMenuOpen(false);
              }}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-controls="platform-mobile-navigation"
              aria-expanded={mobileOpen}
              className="grid size-11 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
            >
              {mobileOpen ? (
                <X aria-hidden="true" className="size-5" />
              ) : (
                <Menu aria-hidden="true" className="size-5" />
              )}
            </button>
            <Link
              href="/dashboard"
              aria-label="VistaTeacher home"
              className="flex shrink-0 items-center gap-2 lg:hidden"
            >
              <span
                aria-hidden="true"
                className="bg-accent text-accent-foreground grid size-7 place-items-center rounded-md font-sans text-[11px] font-bold"
              >
                VT
              </span>
              <span className="truncate font-serif text-sm text-white">
                VistaTeacher
              </span>
            </Link>
          </div>
          <Link
            href="/dashboard"
            className="hidden min-h-11 shrink-0 items-center gap-2.5 rounded-lg lg:flex"
          >
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground grid size-9 place-items-center rounded-md font-sans text-sm font-bold"
            >
              VT
            </span>
            <span className="font-serif text-lg text-white">VistaTeacher</span>
          </Link>
          <div className="hidden min-w-0 flex-1 lg:block lg:px-5">
            <GlobalSearch />
          </div>
          <div className="lg:hidden">
            <GlobalSearch
              enableShortcut={false}
              triggerVariant="icon"
              onOpen={() => {
                setMobileOpen(false);
                setUserMenuOpen(false);
              }}
            />
          </div>
          <NotificationMenu onOpen={() => setUserMenuOpen(false)} />
          <div className="relative">
            <button
              type="button"
              aria-label="Open profile menu"
              aria-controls="profile-navigation"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              onClick={() => setUserMenuOpen((value) => !value)}
              className="grid size-11 place-items-center rounded-xl ring-2 ring-white/25 transition-colors hover:ring-white/60"
            >
              <UserAvatar
                name={account.displayName}
                photoURL={account.photoURL}
                className="size-9 rounded-xl text-xs"
              />
            </button>
            {userMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close profile menu"
                  onClick={() => setUserMenuOpen(false)}
                  tabIndex={-1}
                  className="fixed inset-0 z-40"
                />
                <div
                  id="profile-navigation"
                  aria-label="Profile navigation"
                  className="bg-card text-card-foreground border-border absolute top-12 right-0 z-50 w-60 overflow-hidden rounded-xl border py-1 shadow-xl"
                >
                  <div className="border-border border-b px-4 py-3">
                    <p className="truncate text-sm font-bold">
                      {account.displayName}
                    </p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {account.subject}
                    </p>
                    <span
                      className={cn(
                        "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        plan === "plus"
                          ? "bg-accent/15 text-accent-readable"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {plan === "plus" ? "Plus Plan" : "Community Plan"}
                    </span>
                  </div>
                  <Link
                    href={profileHref}
                    onClick={() => setUserMenuOpen(false)}
                    className="hover:bg-muted flex min-h-11 items-center px-4 text-sm font-semibold"
                  >
                    My Profile
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={() => setUserMenuOpen(false)}
                    className="hover:bg-muted flex min-h-11 items-center px-4 text-sm font-semibold"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/resources"
                    onClick={() => setUserMenuOpen(false)}
                    className="hover:bg-muted flex min-h-11 items-center px-4 text-sm font-semibold"
                  >
                    My Resources
                  </Link>
                  <Link
                    href="/settings/billing"
                    onClick={() => setUserMenuOpen(false)}
                    className="hover:bg-muted flex min-h-11 items-center px-4 text-sm font-semibold"
                  >
                    Pricing &amp; Plans
                  </Link>
                  {account.role === "platform_admin" && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="hover:bg-muted flex min-h-11 items-center px-4 text-sm font-semibold"
                    >
                      Administration
                    </Link>
                  )}
                  <Link
                    href="/settings/profile"
                    scroll={false}
                    onClick={() => {
                      setUserMenuOpen(false);
                      const root = document.documentElement;
                      const previousBehavior = root.style.scrollBehavior;
                      root.style.scrollBehavior = "auto";
                      window.scrollTo({ left: 0, top: 0 });
                      root.style.scrollBehavior = previousBehavior;
                    }}
                    className="hover:bg-muted flex min-h-11 items-center px-4 text-sm font-semibold"
                  >
                    Settings
                  </Link>
                  <div className="border-border border-t">
                    <LogoutButton appearance="menu" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <nav
          aria-label="Primary platform navigation"
          className="border-sidebar-border hidden border-t lg:block"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-1 overflow-x-auto px-6">
            {primaryNavigation.map(({ label, href, ...item }) => {
              const active =
                pathname === href ||
                (href !== "/app" && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-12 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition-colors",
                    active ? "text-white" : "text-white/75 hover:text-white",
                  )}
                >
                  {label}
                  {"plus" in item && item.plus && (
                    <span className="text-[9px] font-bold text-[#ffaaa2]">
                      Plus
                    </span>
                  )}
                  {active && (
                    <span className="bg-accent absolute inset-x-3 bottom-0 h-0.5 rounded-t" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          immersiveMessages && "overflow-hidden",
        )}
      >
        <main className={cn("flex-1", immersiveMessages && "min-h-0")}>
          {children}
        </main>
        {!immersiveMessages && <PlatformFooter />}
      </div>
    </div>
  );
}

function PlatformFooter() {
  return (
    <footer
      aria-label="Platform footer navigation"
      className="bg-sidebar text-sidebar-foreground/75 border-sidebar-border mt-auto border-t px-5 py-10 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <div>
            <Link
              href="/dashboard"
              className="text-sidebar-foreground inline-flex items-center gap-2 font-serif text-lg"
            >
              <span
                aria-hidden="true"
                className="bg-accent text-accent-foreground grid size-8 place-items-center rounded-md font-sans text-xs font-bold"
              >
                VT
              </span>
              VistaTeacher
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6">
              A professional community built around the work educators share:
              resources, conversations, and classroom-ready support.
            </p>
          </div>
          <div>
            <p className="text-sidebar-foreground border-accent mb-3 border-b pb-2 text-xs font-bold tracking-[0.12em] uppercase">
              Product
            </p>
            <nav aria-label="Product links" className="grid gap-2.5 text-sm">
              <Link className="hover:text-white" href="/resources">
                Resources
              </Link>
              <Link className="hover:text-white" href="/ai-lessons">
                AI Lesson Builder
              </Link>
              <Link className="hover:text-white" href="/settings/billing">
                Compare plans
              </Link>
            </nav>
          </div>
          <div>
            <p className="text-sidebar-foreground border-accent mb-3 border-b pb-2 text-xs font-bold tracking-[0.12em] uppercase">
              Community
            </p>
            <nav aria-label="Community links" className="grid gap-2.5 text-sm">
              <Link className="hover:text-white" href="/forum">
                Forum
              </Link>
              <Link className="hover:text-white" href="/network">
                Network
              </Link>
              <Link className="hover:text-white" href="/support">
                Help &amp; feedback
              </Link>
            </nav>
          </div>
          <div>
            <p className="text-sidebar-foreground border-accent mb-3 border-b pb-2 text-xs font-bold tracking-[0.12em] uppercase">
              Company
            </p>
            <nav aria-label="Company links" className="grid gap-2.5 text-sm">
              <Link className="hover:text-white" href="/about">
                About
              </Link>
              <Link className="hover:text-white" href="/information">
                About &amp; policies
              </Link>
              <Link className="hover:text-white" href="/privacy">
                Privacy
              </Link>
              <Link className="hover:text-white" href="/cookies">
                Cookies
              </Link>
              <Link className="hover:text-white" href="/terms">
                Terms
              </Link>
            </nav>
          </div>
        </div>
        <div className="border-sidebar-border mt-8 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 VistaTeacher. All rights reserved.</p>
          <p className="text-sidebar-foreground/55">
            Built for educators who share what works.
          </p>
        </div>
      </div>
    </footer>
  );
}
