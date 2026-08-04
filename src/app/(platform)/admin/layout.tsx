import {
  Activity,
  BadgeCheck,
  Flag,
  LayoutDashboard,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/admin/auth";

const navigation = [
  ["Overview", "/admin", LayoutDashboard],
  ["Users", "/admin/users", UsersRound],
  ["Content", "/admin/content", Activity],
  ["Reports", "/admin/reports", Flag],
  ["Verification", "/admin/verification", BadgeCheck],
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();
  return (
    <div className="h-full overflow-y-auto px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-primary font-mono text-[10px] font-bold uppercase">
              Trusted operations
            </p>
            <h1 className="mt-2 font-serif text-3xl">Administration</h1>
          </div>
          <nav
            aria-label="Administration"
            className="flex gap-1 overflow-x-auto"
          >
            {navigation.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                className="hover:bg-muted flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold"
              >
                <Icon className="text-primary size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}
