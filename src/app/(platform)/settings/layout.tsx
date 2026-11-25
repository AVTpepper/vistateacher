"use client";

import { CreditCard, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const settingsNavigation = [
  { href: "/settings/profile", label: "Edit profile", icon: UserRound },
  { href: "/settings", label: "Privacy & account", icon: LockKeyhole },
  { href: "/settings/security", label: "Login & security", icon: ShieldCheck },
  { href: "/settings/billing", label: "Plan & billing", icon: CreditCard },
] as const;

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
    const frame = window.requestAnimationFrame(() => {
      const scroller = document.getElementById("platform-scroll-container");
      if (scroller) scroller.scrollTo({ ...position, behavior: "auto" });
      else window.scrollTo(position);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);
  const preserveScroll = () => {
    const scroller = document.getElementById("platform-scroll-container");
    pendingScroll.current = scroller
      ? { left: scroller.scrollLeft, top: scroller.scrollTop }
      : { left: window.scrollX, top: window.scrollY };
  };
  const isActive = (href: string) =>
    href === "/settings"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="page-container max-w-5xl [overflow-anchor:none]">
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
          {settingsNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              scroll={false}
              onClick={preserveScroll}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors",
                isActive(href)
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "hover:bg-muted",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
