"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getFirebaseClient } from "@/lib/firebase/client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Server logout failed.");

      await getFirebaseClient()
        .auth.signOut()
        .catch(() => undefined);
      setOpen(false);
      router.replace("/sign-in");
      router.refresh();
    } catch {
      toast.error("We couldn't log you out. Please try again.");
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <Button
          className="h-11 flex-1 px-2 text-xs text-white/75 hover:bg-white/8 hover:text-red-200"
          variant="ghost"
          title="Sign out"
        >
          <LogOut aria-hidden="true" />
          {!compact && "Log out"}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content className="bg-card fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 shadow-xl">
          <AlertDialog.Title className="font-serif text-2xl">
            Log out of VistaTeacher?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground mt-2 text-sm leading-6">
            You will need to sign in again to access your profile, messages, and
            saved resources.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void logout()}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              Log out
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
