"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getFirebaseClient } from "@/lib/firebase/client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
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
    <Button
      className="h-8 flex-1 px-2 text-xs text-white/40 hover:bg-white/8 hover:text-red-300"
      variant="ghost"
      onClick={logout}
      title="Sign out"
    >
      <LogOut aria-hidden="true" />
      {!compact && "Log out"}
    </Button>
  );
}
