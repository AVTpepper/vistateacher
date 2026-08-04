import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  photoURL,
  className,
}: {
  name: string;
  photoURL: string | null;
  className?: string;
}) {
  if (photoURL) {
    return (
      // User profile images are stored in Firebase and have runtime origins.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt={name}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-label={name}
      className={cn(
        "bg-secondary text-primary grid place-items-center font-bold",
        className,
      )}
    >
      {name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2) || <UserRound aria-hidden="true" />}
    </span>
  );
}
