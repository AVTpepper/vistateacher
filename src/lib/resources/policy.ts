import type { UserStatus } from "@/types/models";

export function canReserveResource({
  status,
}: {
  status: UserStatus;
}) {
  if (status !== "active")
    return { allowed: false, reason: "inactive" } as const;
  return { allowed: true } as const;
}

export function canDownloadResource({
  status,
}: {
  status: UserStatus;
}) {
  if (status !== "active")
    return { allowed: false, reason: "inactive" } as const;
  return { allowed: true } as const;
}
