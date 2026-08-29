import type { Metadata } from "next";

import { VerifyEmailPanel } from "@/features/auth/verify-email-panel";
import { safeReturnTo } from "@/lib/auth/return-to";
import { parsePlanIntent } from "@/lib/billing/plan-intent";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    interval?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const planIntent = parsePlanIntent(params.plan, params.interval);
  const returnTo = safeReturnTo(
    Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
  );
  return <VerifyEmailPanel planIntent={planIntent} returnTo={returnTo} />;
}
