"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/http/client";
export function DeletionRetryButton({ uid }: { uid: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void requestJson<{ status: string }>("/api/admin/deletions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        })
          .then((result) => {
            toast[result.status === "complete" ? "success" : "error"](
              result.status === "complete"
                ? "Account deletion completed."
                : "Deletion still needs attention.",
            );
            router.refresh();
          })
          .catch((error) => toast.error(error.message))
          .finally(() => setPending(false));
      }}
    >
      {pending ? "Processing..." : "Retry deletion"}
    </Button>
  );
}
