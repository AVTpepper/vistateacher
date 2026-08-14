import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

interface FormFieldRenderProps {
  describedBy: string | undefined;
  invalid: boolean;
}

export function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  action,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  action?: ReactNode;
  children: ReactNode | ((props: FormFieldRenderProps) => ReactNode);
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const content =
    typeof children === "function"
      ? children({ describedBy, invalid: Boolean(error) })
      : children;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span className="text-destructive ml-1" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </Label>
        {action}
      </div>
      {content}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
