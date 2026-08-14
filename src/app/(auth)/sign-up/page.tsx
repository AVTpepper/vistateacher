import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/features/auth/auth-form";
import { hrefWithReturnTo, safeReturnTo } from "@/lib/auth/return-to";
import { parsePlanIntent, planIntentHref } from "@/lib/billing/plan-intent";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
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
      <h1 className="font-serif text-3xl">Create your VistaTeacher account</h1>
      <p className="text-muted-foreground mt-2 mb-7 text-sm">
        {planIntent
          ? "Create your educator account to continue with VistaTeacher Plus."
          : "Create your professional educator account."}
      </p>
      <AuthForm mode="sign-up" planIntent={planIntent} returnTo={returnTo} />
      <p className="text-muted-foreground mt-6 text-xs leading-5">
        By creating an account, you agree to the{" "}
        <Link className="underline" href="/terms">
          Terms
        </Link>{" "}
        and acknowledge the{" "}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="text-muted-foreground mt-5 text-center text-sm">
        Already have an account?{" "}
        <Link
          className="text-primary font-bold hover:underline"
          href={hrefWithReturnTo(
            planIntentHref("/sign-in", planIntent),
            returnTo,
          )}
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
