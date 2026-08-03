import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireCurrentAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your account" };

export default async function AppPage() {
  const account = await requireCurrentAccount();
  if (!account.onboarded) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
      <p className="text-primary font-mono text-xs font-bold uppercase">
        Profile complete
      </p>
      <h1 className="mt-3 max-w-2xl font-serif text-4xl sm:text-5xl">
        Welcome to VistaTeacher, {account.displayName}.
      </h1>
      <p className="text-muted-foreground mt-5 max-w-xl leading-7">
        Your educator account is ready.
      </p>
    </main>
  );
}
