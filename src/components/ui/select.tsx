import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-accent bg-input/60 text-foreground focus-visible:border-ring h-11 w-full min-w-0 rounded-md border px-3 text-base shadow-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
