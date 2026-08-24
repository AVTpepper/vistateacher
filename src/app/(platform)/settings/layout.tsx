"use client";

import { CreditCard, LockKeyhole, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const position = pendingScroll.current;
    if (!position) return;
    pendingScroll.current = null;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(position);
    root.style.scrollBehavior = previousBehavior;
  }, [pathname]);
  const preserveScroll = () => {
    pendingScroll.current = { left: window.scrollX, top: window.scrollY };
  };
  const isActive = (href: string) =>
    href === "/settings"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 [overflow-anchor:none] lg:px-6">
      <div className="mb-6">
        <p className="text-primary font-mono text-[10px] font-bold tracking-widest uppercase">
          Account
        </p>
        <h1 className="mt-2 font-serif text-3xl">Settings</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings navigation"
          className="surface-card h-fit space-y-1 p-2"
        >
          <Link
            href="/settings/profile"
            scroll={false}
            onClick={preserveScroll}
            aria-current={isActive("/settings/profile") ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
              isActive("/settings/profile")
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "hover:bg-muted",
            )}
          >
            <UserRound aria-hidden="true" className="size-4" />
            Edit profile
          </Link>
          <Link
            href="/settings"
            scroll={false}
            onClick={preserveScroll}
            aria-current={isActive("/settings") ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
              isActive("/settings")
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "hover:bg-muted",
            )}
          >
            <LockKeyhole aria-hidden="true" className="size-4" />
            Privacy & account
          </Link>
          <Link
            href="/settings/billing"
            scroll={false}
            onClick={preserveScroll}
            aria-current={isActive("/settings/billing") ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
              isActive("/settings/billing")
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "hover:bg-muted",
            )}
          >
            <CreditCard aria-hidden="true" className="size-4" />
            Plan & billing
          </Link>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
