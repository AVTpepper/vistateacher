"use client";

import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refreshFirebaseClientAuth } from "@/lib/firebase/client-auth";
import { getFirebaseClient } from "@/lib/firebase/client";
import { requestJson } from "@/lib/http/client";
import { signUpSchema, passwordResetSchema } from "@/schemas/auth";

export function SecuritySettings({ email }: { email: string }) {
  const [passwordAccount, setPasswordAccount] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void refreshFirebaseClientAuth()
      .then(({ auth }) => {
        if (active)
          setPasswordAccount(
            auth.currentUser?.providerData.some(
              (provider) => provider.providerId === "password",
            ) ?? false,
          );
      })
      .catch(() => {
        if (active)
          setError(
            "Account security couldn't load. Reload this page to retry.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function action(kind: "password" | "email" | "reset") {
    if (pending) return;
    setError(null);
    setNotice(null);
    const validated =
      kind === "password"
        ? signUpSchema.shape.password.safeParse(newPassword)
        : passwordResetSchema.shape.email.safeParse(
            kind === "email" ? newEmail : email,
          );
    if (!validated.success) {
      setError(validated.error.issues[0]?.message ?? "Review your details.");
      return;
    }
    setPending(true);
    try {
      const { auth } = getFirebaseClient();
      const user = auth.currentUser;
      if (!user)
        throw new Error("Please sign in again to manage your account.");
      if (kind === "reset") {
        await sendPasswordResetEmail(auth, email, {
          url: `${window.location.origin}/sign-in`,
        });
        setNotice("A password reset link has been sent to your login email.");
        return;
      }
      if (passwordAccount) {
        if (!currentPassword)
          throw new Error(
            "Enter your current password to confirm this change.",
          );
        await reauthenticateWithCredential(
          user,
          EmailAuthProvider.credential(email, currentPassword),
        );
      } else {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      }
      if (kind === "email") {
        await verifyBeforeUpdateEmail(user, validated.data, {
          url: `${window.location.origin}/sign-in`,
        });
        setNotice(
          "Check your new email for a verification link. Your login email changes only after verification; then sign in again.",
        );
      } else {
        await updatePassword(user, validated.data);
        // Password changes revoke old sessions. Establish a fresh session after reauthentication.
        await requestJson("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: await user.getIdToken(true) }),
        });
        setNotice("Your password has been changed.");
        setNewPassword("");
      }
      setCurrentPassword("");
    } catch (caught) {
      const code =
        caught && typeof caught === "object" && "code" in caught
          ? String(caught.code)
          : "";
      setError(
        code.includes("invalid-credential")
          ? "Your current password is incorrect."
          : code.includes("email-already-in-use")
            ? "Another account already uses that email."
            : code.includes("popup-closed")
              ? "Confirmation was canceled. Try again when you're ready."
              : code.includes("too-many-requests")
                ? "Too many attempts. Please try again later."
                : code.includes("network-request-failed")
                  ? "Check your connection and try again."
                  : caught instanceof Error && !code
                    ? caught.message
                    : "We couldn't complete this change. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="surface-card space-y-6 p-5 sm:p-6"
      aria-labelledby="security-heading"
    >
      <header>
        <h2 id="security-heading" className="font-serif text-2xl">
          Login and security
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Your login email is{" "}
          <strong className="text-foreground break-all">{email}</strong>. This
          is separate from the contact email on your profile.
        </p>
      </header>
      {passwordAccount && (
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={pending}
          />
        </div>
      )}
      <form
        className="space-y-3 border-t pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void action("email");
        }}
      >
        <Label htmlFor="new-login-email">New login email</Label>
        <Input
          id="new-login-email"
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          disabled={pending}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={pending || passwordAccount === null}
        >
          Verify new email
        </Button>
      </form>
      {passwordAccount && (
        <form
          className="space-y-3 border-t pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void action("password");
          }}
        >
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={pending}
          />
          <p className="text-muted-foreground text-xs">
            Use at least 10 characters, with an uppercase letter, a lowercase
            letter, and a number.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Change password
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void action("reset")}
            >
              Send password reset link
            </Button>
          </div>
        </form>
      )}
      {passwordAccount === false && (
        <p className="text-muted-foreground text-sm">
          You sign in with Google. Google will ask you to confirm your identity
          before changing your login email.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="bg-success/10 text-success rounded-xl p-4 text-sm"
        >
          {notice}
        </p>
      )}
      {pending && (
        <p role="status" className="text-muted-foreground text-sm">
          Confirming your account change...
        </p>
      )}
    </section>
  );
}
