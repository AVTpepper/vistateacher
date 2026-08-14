import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export function ProfileIdentityLink({
  uid,
  displayName,
  photoURL,
  avatarClassName = "size-9 rounded-full text-[10px]",
  className,
  showName = true,
  showAvatar = true,
  detail,
  onClick,
}: {
  uid: string;
  displayName: string;
  photoURL: string | null;
  avatarClassName?: string;
  className?: string;
  showName?: boolean;
  showAvatar?: boolean;
  detail?: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={`/profile/${encodeURIComponent(uid)}`}
      aria-label={`View ${displayName}'s profile`}
      onClick={onClick}
      className={cn(
        "hover:text-primary inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-md transition-colors focus-visible:outline-none",
        className,
      )}
    >
      {showAvatar && (
        <UserAvatar
          name={displayName}
          photoURL={photoURL}
          className={cn("shrink-0", avatarClassName)}
        />
      )}
      {showName && (
        <span className="min-w-0">
          <span className="block truncate font-bold">{displayName}</span>
          {detail && (
            <span className="text-muted-foreground block truncate text-xs font-normal">
              {detail}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
