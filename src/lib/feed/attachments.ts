export const POST_FILE_MAX_SIZE = 25 * 1024 * 1024;

export const POST_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;

export type PostFileMimeType = (typeof POST_FILE_MIME_TYPES)[number];

const contentTypeByExtension: Record<string, PostFileMimeType> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
};

export const POST_FILE_ACCEPT = Object.keys(contentTypeByExtension)
  .map((extension) => `.${extension}`)
  .join(",");

export function postFileContentType(fileName: string): PostFileMimeType | null {
  const extension = fileName.split(".").at(-1)?.toLocaleLowerCase("en-US");
  return extension ? (contentTypeByExtension[extension] ?? null) : null;
}

export function postFileError(file: Pick<File, "name" | "size">) {
  if (/[\\/\u0000-\u001f]/u.test(file.name)) return "Use a valid file name.";
  if (!postFileContentType(file.name))
    return "Choose a PDF, Word, PowerPoint, spreadsheet, CSV, or text file.";
  if (file.size > POST_FILE_MAX_SIZE) return "Files must be 25 MB or smaller.";
  return null;
}

export function formatPostFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizedHttpURL(value: string): string | null {
  const candidate = /^https?:\/\//iu.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function isHttpURL(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
