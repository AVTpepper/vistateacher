export const RESOURCE_MAX_FILE_SIZE = 25 * 1024 * 1024;

export const RESOURCE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
] as const;

export type ResourceMimeType = (typeof RESOURCE_MIME_TYPES)[number];

const contentTypeByExtension: Record<string, ResourceMimeType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
};

export const RESOURCE_FILE_ACCEPT = Object.keys(contentTypeByExtension)
  .map((extension) => `.${extension}`)
  .join(",");

export function resourceFileContentType(fileName: string) {
  const extension = fileName.split(".").at(-1)?.toLocaleLowerCase("en-US");
  return extension ? (contentTypeByExtension[extension] ?? null) : null;
}

export function resourceFileError(file: {
  name: string;
  type: string;
  size: number;
}) {
  if (!resourceFileContentType(file.name))
    return "This file type is not supported. Choose a PDF, DOCX, PPT, PPTX, JPEG, PNG, WebP, HEIC, HEIF, or MP4 file.";
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
