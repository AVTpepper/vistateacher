"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getFirebaseClient } from "@/lib/firebase/client";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await Promise.all([
      getFirebaseClient().auth.signOut(),
      fetch("/api/auth/logout", { method: "POST" }),
    ]);
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={logout}>
      <LogOut aria-hidden="true" />
      Sign out
    </Button>
  );
}
