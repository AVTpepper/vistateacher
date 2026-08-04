import { LockKeyhole, UserRound } from "lucide-react";
import Link from "next/link";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          className="bg-card h-fit space-y-1 rounded-xl border p-2"
        >
          <Link
            href="/settings/profile"
            className="hover:bg-muted flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold"
          >
            <UserRound aria-hidden="true" className="text-primary size-4" />
            Edit profile
          </Link>
          <Link
            href="/settings"
            className="hover:bg-muted flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold"
          >
            <LockKeyhole aria-hidden="true" className="text-primary size-4" />
            Privacy & account
          </Link>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
