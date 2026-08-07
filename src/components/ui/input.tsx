import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-accent bg-input/60 text-foreground placeholder:text-muted-foreground focus-visible:border-ring h-11 w-full rounded-md border px-3 text-sm shadow-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
