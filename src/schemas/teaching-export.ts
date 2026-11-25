import { z } from "zod";
import { resourceMetadataSchema } from "@/schemas/resource";
import { isGoogleDriveUploadUri } from "@/lib/google-drive/upload-uri";

const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const teachingExportIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const driveDestinationSchema = z
  .object({
    id: safeId,
    email: z.email().max(254),
    name: z.string().trim().min(1).max(200),
  })
  .strict();
export const teachingExportCreateSchema = z
  .object({
    kind: z.enum(["lesson", "worksheet"]),
    sourceId: safeId,
    version: z.number().int().min(1).max(1000000),
    mode: z.enum(["student", "key"]).default("student"),
    destination: driveDestinationSchema,
  })
  .strict()
  .refine((input) => input.kind !== "lesson" || input.mode === "student", {
    message: "Answer-key exports are only available for worksheets.",
  });
const claim = z.uuid();
const uri = z
  .string()
  .max(4096)
  .refine(isGoogleDriveUploadUri, "Invalid Google upload session.");
export const googleDocumentSchema = z
  .object({
    id: safeId,
    title: z.string().trim().min(1).max(1000),
    url: z.string().max(500),
  })
  .strict()
  .refine(
    (doc) => doc.url === `https://docs.google.com/document/d/${doc.id}/edit`,
    {
      message: "Invalid Google document link.",
    },
  );
export const teachingExportMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("session"), claim, uri }).strict(),
  z
    .object({
      action: z.literal("complete"),
      claim,
      document: googleDocumentSchema,
    })
    .strict(),
  z.object({ action: z.literal("release"), claim }).strict(),
  z
    .object({
      action: z.literal("restart"),
      expectedDocumentId: safeId.nullable(),
      expectedSessionUri: uri.nullable(),
    })
    .strict(),
]);
export const teachingExportPublishSchema = z
  .object({
    publicationId: z.uuid(),
    metadata: resourceMetadataSchema
      .extend({ accessTier: z.literal("free") })
      .strict(),
  })
  .strict();
export type TeachingExportCreate = z.infer<typeof teachingExportCreateSchema>;
export type TeachingExportMutation = z.infer<
  typeof teachingExportMutationSchema
>;
export type TeachingExportPublish = z.infer<typeof teachingExportPublishSchema>;
export type ExportMetadata = TeachingExportPublish["metadata"];
export interface TeachingExportJob {
  id: string;
  title: string;
  version: number;
  mode: "student" | "key";
  byteLength: number;
  binaryHash: string;
  sourceFingerprint: string;
  state: "ready" | "uploading" | "complete";
  document: z.infer<typeof googleDocumentSchema> | null;
  uploadSessionUri: string | null;
  destination: z.infer<typeof driveDestinationSchema>;
  defaults: ExportMetadata;
  publication: {
    publicationId: string;
    metadata: ExportMetadata;
    resourceId: string | null;
    state: "pending" | "complete";
    available?: boolean;
  } | null;
}
