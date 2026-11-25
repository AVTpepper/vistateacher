import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/features/marketing/landing-page";
import { getCurrentAccount } from "@/lib/auth/session";
import { SIGNED_IN_HOME } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "VistaTeacher | Find your people in education",
  description:
    "VistaTeacher helps educators connect with peers, share resources, join thoughtful forum discussions, and grow their professional network.",
  alternates: { canonical: "/" },
};

export default async function Home() {
  const account = await getCurrentAccount();
  if (account) redirect(account.onboarded ? SIGNED_IN_HOME : "/onboarding");

  return <LandingPage />;
}
