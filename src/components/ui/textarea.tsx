import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-accent bg-input/60 text-foreground placeholder:text-muted-foreground focus-visible:border-ring min-h-24 w-full min-w-0 rounded-md border px-3 py-2.5 text-base shadow-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
