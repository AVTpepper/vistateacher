"use client";

import { sendEmailVerification } from "firebase/auth";
import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { planIntentHref, type PlanIntent } from "@/lib/billing/plan-intent";
import { getFirebaseClient } from "@/lib/firebase/client";

export function VerifyEmailPanel({
  planIntent = null,
}: {
  planIntent?: PlanIntent | null;
}) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const checkInProgress = useRef(false);

  async function checkVerification(silent = false) {
    if (checkInProgress.current) return;
    checkInProgress.current = true;
    const { auth } = getFirebaseClient();
    setIsChecking(true);
    setError(null);
    setNotice(null);
    setRequiresSignIn(false);
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) {
      setNotice(
        "To continue in this browser, sign in with the account you just verified.",
      );
      setRequiresSignIn(true);
      setIsChecking(false);
      checkInProgress.current = false;
      return;
    }

    try {
      await user.reload();
      if (!user.emailVerified) {
        if (!silent) {
          setNotice(
            "We haven't detected verification yet. Open the link in your inbox, then return here.",
          );
        }
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
          setNotice(
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
      router.push(
        planIntent && result.next === "/app"
          ? planIntentHref("/settings/billing", planIntent)
          : planIntentHref(result.next, planIntent),
      );
      router.refresh();
    } catch (caught) {
      const code =
        typeof caught === "object" && caught && "code" in caught
          ? String(caught.code)
          : "";
      if (
        code.includes("user-token-expired") ||
        code.includes("user-disabled") ||
        code.includes("user-not-found") ||
        code.includes("invalid-user-token")
      ) {
        await auth.signOut().catch(() => undefined);
        setNotice("Your verification session expired. Sign in to continue.");
        setRequiresSignIn(true);
      } else {
        setError(
          "We couldn't confirm this session. Open the verification link in the same browser, then sign in again.",
        );
      }
    } finally {
      setIsChecking(false);
      checkInProgress.current = false;
    }
  }

  const checkAfterReturn = useEffectEvent(() => {
    void checkVerification(true);
  });

  useEffect(() => {
    queueMicrotask(checkAfterReturn);

    function checkWhenVisible() {
      if (document.visibilityState === "visible") checkAfterReturn();
    }

    window.addEventListener("focus", checkAfterReturn);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", checkAfterReturn);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, []);

  async function resend() {
    const user = getFirebaseClient().auth.currentUser;
    if (!user) {
      setError("Sign in again before requesting another email.");
      return;
    }
    await sendEmailVerification(user, {
      url: `${window.location.origin}${planIntentHref("/verify-email", planIntent)}`,
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
      {notice && (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={
          requiresSignIn
            ? () => router.push(planIntentHref("/sign-in", planIntent))
            : () => void checkVerification()
        }
        disabled={isChecking}
      >
        {isChecking ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <CheckCircle2 aria-hidden="true" />
        )}
        {requiresSignIn ? "Sign in to continue" : "Check verification"}
      </Button>
      <div className="flex justify-center gap-5 text-sm font-bold">
        <button
          className="text-primary hover:underline"
          type="button"
          onClick={resend}
        >
          Resend email
        </button>
        <Link
          className="text-primary hover:underline"
          href={planIntentHref("/sign-in", planIntent)}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
