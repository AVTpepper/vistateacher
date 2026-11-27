/** Offline-reviewed migration tool. Default is a metadata-only dry run.
 * Never runs during app startup/deployment. Explicit apply requires a completed,
 * reviewed manifest and acknowledgement that copied Firebase links will expire.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { z } from "zod";

const entrySchema = z.object({
  path: z.string(), generation: z.string(), metageneration: z.string(), hadTokens: z.boolean(),
  state: z.enum(["pending", "revoked", "already-private", "stale", "missing", "failed"]).default("pending"),
});
const manifestSchema = z.object({
  version: z.literal(1), project: z.string(), bucket: z.string(), createdAt: z.string(),
  scanComplete: z.boolean(), entries: z.array(entrySchema),
  cursors: z.object({ posts: z.string().nullable(), resources: z.string().nullable() }),
});
type Manifest = z.infer<typeof manifestSchema>;
const argumentsList = process.argv.slice(2);
function argument(name: string) { const index = argumentsList.indexOf(name); return index >= 0 ? argumentsList[index + 1] : undefined; }
const project = argument("--project"), bucketName = argument("--bucket"), manifestPath = argument("--manifest");
const apply = argumentsList.includes("--apply"), resume = argumentsList.includes("--resume");
if (!project || !bucketName || !manifestPath || /[\/\\]/u.test(bucketName)) throw new Error("Required: --project PROJECT --bucket BUCKET --manifest FILE; dry run is the default.");
if (apply && !argumentsList.includes("--ack-revoke-issued-links")) throw new Error("Apply requires --ack-revoke-issued-links and a reviewed completed manifest.");
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST && (!project.startsWith("demo-") || !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/u.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST))) throw new Error("An emulator run requires an explicit local demo project.");
const filePath = resolve(manifestPath);
const app = initializeApp({ projectId: project, storageBucket: bucketName, credential: applicationDefault() }, "community-token-migration");
const bucket = getStorage(app).bucket(bucketName);
function supportedPath(path: string) {
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\\%\u0000-\u001f]/u.test(part))) return false;
  return (parts[0] === "posts" && parts.length === 4) || (parts[0] === "resources" && (parts.length === 4 || (parts.length === 5 && parts[3] === "thumbnail")));
}
let manifest: Manifest;
if (apply || resume) {
  manifest = manifestSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
  if (manifest.project !== project || manifest.bucket !== bucketName) throw new Error("Manifest target does not match the explicit project and bucket.");
} else {
  manifest = { version: 1, project, bucket: bucketName, createdAt: new Date().toISOString(), scanComplete: false, entries: [], cursors: { posts: null, resources: null } };
}
const save = () => writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
if (!apply) {
  if (!manifest.scanComplete) {
    const indexed = new Map(manifest.entries.map(entry => [entry.path, entry]));
    for (const prefix of ["posts", "resources"] as const) {
      // A completed prefix is represented by a sentinel rather than rescanned.
      if (manifest.cursors[prefix] === "__complete__") continue;
      let pageToken = manifest.cursors[prefix] ?? undefined;
      do {
        const [files, next] = await bucket.getFiles({ prefix: `${prefix}/`, autoPaginate: false, maxResults: 100, pageToken });
        for (const file of files) {
          if (!supportedPath(file.name)) { console.error("Skipped unsupported object identity; review separately", file.name); continue; }
          const [metadata] = await file.getMetadata();
          indexed.set(file.name, { path: file.name, generation: String(metadata.generation ?? ""), metageneration: String(metadata.metageneration ?? ""), hadTokens: Boolean(metadata.metadata?.firebaseStorageDownloadTokens), state: "pending" });
        }
        pageToken = next?.pageToken;
        manifest.entries = [...indexed.values()];
        manifest.cursors[prefix] = pageToken ?? "__complete__";
        await save();
      } while (pageToken);
    }
    manifest.scanComplete = true;
    await save();
  }
  console.log(JSON.stringify({ mode: "dry-run", project, bucket: bucketName, objects: manifest.entries.length, tokenBearingObjects: manifest.entries.filter(entry => entry.hadTokens).length, manifest: filePath }));
} else {
  if (!manifest.scanComplete) throw new Error("Complete and review the dry-run manifest before applying.");
  for (const entry of manifest.entries) {
    if (entry.state === "revoked" || entry.state === "already-private") continue;
    if (!supportedPath(entry.path) || !entry.generation || !entry.metageneration) throw new Error("Invalid manifest object identity.");
    const file = bucket.file(entry.path);
    try {
      const [metadata] = await file.getMetadata();
      if (!metadata.metadata?.firebaseStorageDownloadTokens) entry.state = "already-private";
      else if (String(metadata.generation) !== entry.generation || String(metadata.metageneration) !== entry.metageneration) entry.state = "stale";
      else {
        await file.setMetadata({ cacheControl: "private, no-store", metadata: { firebaseStorageDownloadTokens: null } }, { preconditionOpts: { ifMetagenerationMatch: entry.metageneration } });
        const [confirmed] = await file.getMetadata();
        entry.state = !confirmed.metadata?.firebaseStorageDownloadTokens && String(confirmed.generation) === entry.generation ? "revoked" : "failed";
      }
    } catch (error) { entry.state = error && typeof error === "object" && "code" in error && error.code === 404 ? "missing" : "failed"; }
    await save(); // Resume never forgets a confirmed revocation.
  }
  const unresolved = manifest.entries.filter(entry => !["revoked", "already-private"].includes(entry.state));
  console.log(JSON.stringify({ mode: "apply", project, bucket: bucketName, confirmed: manifest.entries.length - unresolved.length, unresolved: unresolved.length, manifest: filePath }));
  if (unresolved.length) process.exitCode = 1;
}
