import type { Metadata } from "next";

import { VerifyEmailPanel } from "@/features/auth/verify-email-panel";
import { parsePlanIntent } from "@/lib/billing/plan-intent";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const planIntent = parsePlanIntent((await searchParams).plan);
  return <VerifyEmailPanel planIntent={planIntent} />;
}
