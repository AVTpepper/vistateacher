import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-serif text-3xl">Reset your password</h1>
      <p className="text-muted-foreground mt-2 mb-7 text-sm leading-6">
        We’ll send a secure reset link to your account email.
      </p>
      <AuthForm mode="reset" />
      <p className="mt-7 text-center text-sm">
        <Link
          className="text-primary font-bold hover:underline"
          href="/sign-in"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
