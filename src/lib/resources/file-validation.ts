export const RESOURCE_MAX_FILE_SIZE = 25 * 1024 * 1024;

export const RESOURCE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const;

export function resourceFileError(file: { type: string; size: number }) {
  if (!(RESOURCE_MIME_TYPES as readonly string[]).includes(file.type))
    return "This file type is not supported. Choose a PDF, DOCX, PPTX, JPEG, PNG, WebP, or MP4 file.";
  if (file.size > RESOURCE_MAX_FILE_SIZE)
    return "This file is too large. Resource files must be 25 MB or smaller.";
  if (file.size <= 0) return "This file is empty. Choose a file with content.";
  return null;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
