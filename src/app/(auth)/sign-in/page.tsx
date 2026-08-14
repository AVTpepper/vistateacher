import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/features/auth/auth-form";
import { hrefWithReturnTo, safeReturnTo } from "@/lib/auth/return-to";
import { parsePlanIntent, planIntentHref } from "@/lib/billing/plan-intent";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const planIntent = parsePlanIntent(params.plan);
  const returnTo = safeReturnTo(
    Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo,
  );
  return (
    <>
      <h1 className="font-serif text-3xl">Welcome back</h1>
      <p className="text-muted-foreground mt-2 mb-7 text-sm">
        {planIntent
          ? "Sign in to continue with VistaTeacher Plus."
          : "Sign in to your educator community."}
      </p>
      <AuthForm mode="sign-in" planIntent={planIntent} returnTo={returnTo} />
      <p className="text-muted-foreground mt-7 text-center text-sm">
        New to VistaTeacher?{" "}
        <Link
          className="text-primary font-bold hover:underline"
          href={hrefWithReturnTo(
            planIntentHref("/sign-up", planIntent),
            returnTo,
          )}
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
