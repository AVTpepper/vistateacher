export function DraftStatus({
  status,
  restored,
}: {
  status: "idle" | "saved" | "error";
  restored: boolean;
}) {
  if (status === "idle") return null;
  return (
    <p
      role="status"
      className={`text-xs leading-5 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {status === "error"
        ? "Couldn't save a recovery draft. Keep this page open or save your changes before leaving."
        : restored
          ? "Your unfinished draft was restored. Changes are saved on this device."
          : "Draft saved on this device."}
    </p>
  );
}
