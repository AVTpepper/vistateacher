"use client";

import { sendEmailVerification } from "firebase/auth";
import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getFirebaseClient } from "@/lib/firebase/client";

export function VerifyEmailPanel() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);

  async function checkVerification() {
    const { auth } = getFirebaseClient();
    setIsChecking(true);
    setError(null);
    setRequiresSignIn(false);
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) {
      setError(
        "Your email may already be verified. Sign in to continue setting up your account.",
      );
      setRequiresSignIn(true);
      setIsChecking(false);
      return;
    }

    try {
      await user.reload();
      if (!user.emailVerified) {
        setError(
          "That email is not verified yet. Open the link in your inbox first.",
        );
        return;
      }
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await user.getIdToken(true) }),
      });
      const result = (await response.json()) as {
        error?: string;
        next?: string;
      };
      if (!response.ok || !result.next) {
        if (response.status === 401) {
          setError(
            "Your email is verified. Sign in again to continue setting up your account.",
          );
          setRequiresSignIn(true);
          return;
        }
        if (response.status === 403) {
          setError(
            "You're verified, but this session cannot continue. Sign in again.",
          );
          return;
        }
        throw new Error(result.error);
      }
      router.push(result.next);
      router.refresh();
    } catch {
      setError(
        "We couldn't confirm this session. Open the verification link in the same browser, then sign in again.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  async function resend() {
    const user = getFirebaseClient().auth.currentUser;
    if (!user) {
      setError("Sign in again before requesting another email.");
      return;
    }
    await sendEmailVerification(user, {
      url: `${window.location.origin}/verify-email`,
    });
    toast.success("Verification email sent.");
  }

  return (
    <div className="space-y-6 text-center">
      <div className="bg-secondary text-primary mx-auto grid size-14 place-items-center rounded-full">
        <Mail aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-serif text-3xl">Check your inbox</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          Use the verification link we sent, then return here to continue. Your
          educator profile is created after you verify and complete setup.
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          For best results, open the email link in the same browser you used to
          create your account.
        </p>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={requiresSignIn ? () => router.push("/sign-in") : checkVerification}
        disabled={isChecking}
      >
        {isChecking ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        {requiresSignIn ? "Sign in to continue" : "I verified my email"}
      </Button>
      <div className="flex justify-center gap-5 text-sm font-bold">
        <button
          className="text-primary hover:underline"
          type="button"
          onClick={resend}
        >
          Resend email
        </button>
        <Link className="text-primary hover:underline" href="/sign-in">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
