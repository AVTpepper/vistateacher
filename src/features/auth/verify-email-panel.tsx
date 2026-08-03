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

  async function checkVerification() {
    const user = getFirebaseClient().auth.currentUser;
    if (!user) {
      setError("Your sign-in has expired. Sign in again to continue.");
      return;
    }

    setIsChecking(true);
    setError(null);
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
      if (!response.ok || !result.next) throw new Error(result.error);
      router.push(result.next);
      router.refresh();
    } catch {
      setError("We couldn't confirm your email. Please sign in and try again.");
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
          Use the verification link we sent, then return here to continue.
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
        onClick={checkVerification}
        disabled={isChecking}
      >
        {isChecking ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        I verified my email
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
