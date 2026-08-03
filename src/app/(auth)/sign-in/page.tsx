import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <h1 className="font-serif text-3xl">Welcome back</h1>
      <p className="text-muted-foreground mt-2 mb-7 text-sm">
        Sign in to your educator community.
      </p>
      <AuthForm mode="sign-in" />
      <p className="text-muted-foreground mt-7 text-center text-sm">
        New to VistaTeacher?{" "}
        <Link
          className="text-primary font-bold hover:underline"
          href="/sign-up"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
