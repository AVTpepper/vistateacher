"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User,
} from "firebase/auth";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseClient } from "@/lib/firebase/client";
import {
  passwordResetSchema,
  signInSchema,
  signUpSchema,
} from "@/schemas/auth";

type AuthMode = "sign-in" | "sign-up" | "reset";
type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;
type ResetValues = z.infer<typeof passwordResetSchema>;

function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";

  if (code.includes("invalid-credential"))
    return "Email or password is incorrect.";
  if (code.includes("email-already-in-use"))
    return "An account already uses this email.";
  if (code.includes("popup-closed")) return "Google sign-in was canceled.";
  if (code.includes("too-many-requests"))
    return "Too many attempts. Try again later.";
  return "We couldn't complete that request. Please try again.";
}

async function establishSession(user: User): Promise<string> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await user.getIdToken(true) }),
  });
  const result = (await response.json()) as { error?: string; next?: string };
  if (!response.ok || !result.next)
    throw new Error(result.error ?? "Session failed.");
  return result.next;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const schema =
    mode === "sign-up"
      ? signUpSchema
      : mode === "reset"
        ? passwordResetSchema
        : signInSchema;
  const form = useForm<SignInValues | SignUpValues | ResetValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", displayName: "" },
  });
  const isPending = form.formState.isSubmitting;
  const fieldErrors = form.formState.errors as FieldErrors<SignUpValues>;

  async function completeProviderSignIn(user: User) {
    if (!user.emailVerified) {
      router.push("/verify-email");
      return;
    }
    router.push(await establishSession(user));
    router.refresh();
  }

  async function submit(values: SignInValues | SignUpValues | ResetValues) {
    setFormError(null);
    const { auth } = getFirebaseClient();

    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, values.email, {
          url: `${window.location.origin}/sign-in`,
        });
        toast.success("Password reset email sent.");
        return;
      }

      if (mode === "sign-up") {
        const signUpValues = values as SignUpValues;
        const credential = await createUserWithEmailAndPassword(
          auth,
          signUpValues.email,
          signUpValues.password,
        );
        await updateProfile(credential.user, {
          displayName: signUpValues.displayName,
        });
        await sendEmailVerification(credential.user, {
          url: `${window.location.origin}/verify-email`,
        });
        router.push("/verify-email");
        return;
      }

      const signInValues = values as SignInValues;
      const credential = await signInWithEmailAndPassword(
        auth,
        signInValues.email,
        signInValues.password,
      );
      await completeProviderSignIn(credential.user);
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  }

  async function signInWithGoogle() {
    setFormError(null);
    try {
      const credential = await signInWithPopup(
        getFirebaseClient().auth,
        new GoogleAuthProvider(),
      );
      await completeProviderSignIn(credential.user);
    } catch (error) {
      setFormError(authErrorMessage(error));
    }
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
      {mode === "sign-up" && (
        <Field
          id="displayName"
          label="Full name"
          error={fieldErrors.displayName?.message}
        >
          <Input
            id="displayName"
            autoComplete="name"
            {...form.register("displayName")}
          />
        </Field>
      )}

      <Field
        id="email"
        label="Email address"
        error={fieldErrors.email?.message}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...form.register("email")}
        />
      </Field>

      {mode !== "reset" && (
        <Field
          id="password"
          label="Password"
          error={fieldErrors.password?.message}
          action={
            mode === "sign-in" ? (
              <Link
                className="text-primary text-xs font-bold hover:underline"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            ) : undefined
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            {...form.register("password")}
          />
        </Field>
      )}

      {formError && (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      )}

      <Button className="w-full" size="lg" disabled={isPending} type="submit">
        {isPending && (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        )}
        {mode === "sign-in"
          ? "Sign in"
          : mode === "sign-up"
            ? "Create account"
            : "Send reset link"}
        {!isPending && <ArrowRight aria-hidden="true" />}
      </Button>

      {mode !== "reset" && (
        <>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs font-bold uppercase">
              or
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
          <Button
            className="w-full"
            type="button"
            size="lg"
            variant="outline"
            onClick={signInWithGoogle}
          >
            <span aria-hidden="true" className="text-base font-black">
              G
            </span>
            Continue with Google
          </Button>
        </>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  error,
  action,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
