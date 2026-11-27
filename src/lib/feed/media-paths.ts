const attachmentIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const safeSegment = (value: string) =>
  value.length > 0 &&
  value.length <= 200 &&
  value !== "." &&
  value !== ".." &&
  !/[\\/%\u0000-\u001f]/u.test(value);

export function attachmentDeliveryURL(id: string): string {
  if (!attachmentIdPattern.test(id))
    throw new Error("Invalid attachment identity");
  return `/api/feed/attachments/${id}`;
}
export function attachmentIdFromURL(value: string): string | null {
  const prefix = "/api/feed/attachments/";
  if (!value.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return attachmentIdPattern.test(id) ? id : null;
}
export function legacyMediaURL(
  postId: string,
  kind: "image" | "file",
  slot: number,
): string {
  return `/api/feed/${encodeURIComponent(postId)}/media/${kind}/${slot}`;
}
export function legacyMediaSlot(
  value: string,
): { postId: string; kind: "image" | "file"; slot: number } | null {
  const match =
    /^\/api\/feed\/([\w-]{1,128})\/media\/(image|file)\/([0-3])$/u.exec(value);
  return match
    ? {
        postId: match[1],
        kind: match[2] as "image" | "file",
        slot: Number(match[3]),
      }
    : null;
}
export function isPostMediaURL(value: string): boolean {
  if (attachmentIdFromURL(value) || legacyMediaSlot(value)) return true;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Parse object identity only; this module never fetches a URL. */
export function firebaseObjectURL(
  value: string,
  bucket: string,
  emulatorHost?: string,
): { path: string | null } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const production =
    url.protocol === "https:" &&
    url.hostname === "firebasestorage.googleapis.com" &&
    (!url.port || url.port === "443");
  const emulator =
    Boolean(emulatorHost) &&
    url.protocol === "http:" &&
    url.host === emulatorHost;
  if (!production && !emulator) return null;
  const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/u.exec(url.pathname);
  if (!match) return null;
  let parsedBucket: string, path: string;
  try {
    parsedBucket = decodeURIComponent(match[1]);
    path = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (parsedBucket !== bucket) return null;
  return { path: path.split("/").every(safeSegment) ? path : null };
}
export function ownedPostObjectPath(path: string, uid: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 4 &&
    parts.every(safeSegment) &&
    parts[0] === "posts" &&
    parts[1] === uid
  );
}
export function ownedResourceObjectPath(
  path: string,
  uid: string,
  resourceId: string,
): boolean {
  const parts = path.split("/");
  return (
    parts.length === 4 &&
    parts.every(safeSegment) &&
    parts[0] === "resources" &&
    parts[1] === uid &&
    parts[2] === resourceId
  );
}
