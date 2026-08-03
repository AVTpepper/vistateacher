import type { Metadata } from "next";
import Link from "next/link";

import { LogoutButton } from "@/features/auth/logout-button";
import { requireCurrentAccount } from "@/lib/auth/session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCurrentAccount();

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-card border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <Link className="font-serif text-xl" href="/app">
            VistaTeacher
          </Link>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
