"use client";

import {
  Activity,
  BadgeCheck,
  Flag,
  LayoutDashboard,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navigation = [
  ["Overview", "/admin", LayoutDashboard],
  ["Users", "/admin/users", UsersRound],
  ["Content", "/admin/content", Activity],
  ["Reports", "/admin/reports", Flag],
  ["Verification", "/admin/verification", BadgeCheck],
] as const;

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="flex gap-1 overflow-x-auto">
      {navigation.map(([label, href, Icon]) => {
        const active =
          href === "/admin"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "hover:bg-muted flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold",
              active && "bg-secondary text-primary",
            )}
          >
            <Icon aria-hidden="true" className="text-primary size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}