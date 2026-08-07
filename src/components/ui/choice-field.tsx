import { cn } from "@/lib/utils";

export function ChoiceFieldset({
  legend,
  hint,
  error,
  children,
}: {
  legend: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold">{legend}</legend>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{children}</div>
      {error && (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function Choice({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm font-semibold",
        checked && "border-primary bg-secondary text-secondary-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        className="accent-primary size-4"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {label}
    </label>
  );
}
