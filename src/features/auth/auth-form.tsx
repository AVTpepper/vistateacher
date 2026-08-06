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
import { ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { planIntentHref, type PlanIntent } from "@/lib/billing/plan-intent";
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
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "";

  if (code.includes("invalid-credential"))
    return "Email or password is incorrect.";
  if (code.includes("email-already-in-use"))
    return "An account already uses this email.";
  if (code.includes("popup-closed")) return "Google sign-in was canceled.";
  if (code.includes("too-many-requests"))
    return "Too many attempts. Try again later.";
  if (
    code.includes("network-request-failed") ||
    /127\.0\.0\.1:9099|ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(message)
  ) {
    return "The Firebase Auth emulator is not running on 127.0.0.1:9099. Start the emulator suite, or set NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false for local sign-in.";
  }
  if (error instanceof Error && error.message === "Unable to create session.")
    return "Sign-in succeeded, but the server could not create your session. Please try again shortly.";
  if (error instanceof Error && error.message === "Invalid request origin.")
    return "This site URL is not configured for sign-in.";
  if (error instanceof Error && error.message === "Verify your email first.")
    return "Verify your email before signing in.";
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

export function AuthForm({
  mode,
  planIntent = null,
}: {
  mode: AuthMode;
  planIntent?: PlanIntent | null;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
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
  const passwordValue =
    mode === "sign-up" ? String(form.watch("password" as const) ?? "") : "";
  const showPasswordRequirements =
    mode === "sign-up" && (isPasswordFocused || passwordValue.length > 0);
  const passwordRequirements = [
    {
      label: "Use at least 10 characters.",
      met: passwordValue.length >= 10,
    },
    {
      label: "Add a lowercase letter.",
      met: /[a-z]/.test(passwordValue),
    },
    {
      label: "Add an uppercase letter.",
      met: /[A-Z]/.test(passwordValue),
    },
    {
      label: "Add a number.",
      met: /[0-9]/.test(passwordValue),
    },
  ];
  const passwordRegistration = form.register("password");

  function destinationFor(next: string): string {
    return planIntent && next === "/app"
      ? planIntentHref("/settings/billing", planIntent)
      : planIntentHref(next, planIntent);
  }

  async function completeProviderSignIn(user: User) {
    if (!user.emailVerified) {
      router.push(planIntentHref("/verify-email", planIntent));
      return;
    }
    router.push(destinationFor(await establishSession(user)));
    router.refresh();
  }

  async function submit(values: SignInValues | SignUpValues | ResetValues) {
    setFormError(null);
    const { auth } = getFirebaseClient();

    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, values.email, {
          url: `${window.location.origin}${planIntentHref("/sign-in", planIntent)}`,
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
          url: `${window.location.origin}${planIntentHref("/verify-email", planIntent)}`,
        });
        router.push(planIntentHref("/verify-email", planIntent));
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
          error={
            mode === "sign-up" && showPasswordRequirements
              ? undefined
              : fieldErrors.password?.message
          }
          action={
            mode === "sign-in" ? (
              <Link
                className="text-primary text-xs font-bold hover:underline"
                href={planIntentHref("/forgot-password", planIntent)}
              >
                Forgot password?
              </Link>
            ) : undefined
          }
        >
          <div className="relative">
            <Input
              id="password"
              className="pr-16"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              {...passwordRegistration}
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={(event) => {
                passwordRegistration.onBlur(event);
                setIsPasswordFocused(false);
              }}
            />
            <button
              type="button"
              aria-controls="password"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="text-primary absolute inset-y-0 right-3 text-xs font-bold hover:underline"
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {showPasswordRequirements && (
            <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
              {passwordRequirements.map((requirement) => (
                <li
                  key={requirement.label}
                  className={`flex items-center gap-2 ${
                    requirement.met ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {requirement.met ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    <X aria-hidden="true" className="size-3.5" />
                  )}
                  <span>{requirement.label}</span>
                </li>
              ))}
            </ul>
          )}
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
