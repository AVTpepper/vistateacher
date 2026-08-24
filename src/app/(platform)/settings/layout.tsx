"use client";

import { CreditCard, LockKeyhole, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/settings"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
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
