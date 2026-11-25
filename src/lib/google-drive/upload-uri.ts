/** A resumable URI is a private credential, not an arbitrary redirect target. */
export function isGoogleDriveUploadUri(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    /[\s#]/.test(value) ||
    !value.startsWith("https://www.googleapis.com/upload/drive/v3/files?")
  )
    return false;
  try {
    const uri = new URL(value);
    const entries = [...uri.searchParams.entries()];
    const uploadId = uri.searchParams.get("upload_id");
    return (
      uri.origin === "https://www.googleapis.com" &&
      uri.pathname === "/upload/drive/v3/files" &&
      !uri.username &&
      !uri.password &&
      !uri.hash &&
      entries.length === 2 &&
      entries.every(([key]) => key === "uploadType" || key === "upload_id") &&
      uri.searchParams.getAll("uploadType").length === 1 &&
      uri.searchParams.get("uploadType") === "resumable" &&
      uri.searchParams.getAll("upload_id").length === 1 &&
      typeof uploadId === "string" &&
      uploadId.length > 0 &&
      !/[\s\x00-\x1f\x7f]/.test(uploadId)
    );
  } catch {
    return false;
  }
}
