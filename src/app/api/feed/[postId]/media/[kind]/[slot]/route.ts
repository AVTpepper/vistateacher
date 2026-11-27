import type { NextRequest } from "next/server";
import { PostAttachmentError } from "@/lib/feed/attachment-server";
import {
  attachmentBytesResponse,
  postAttachmentRoute,
} from "@/lib/feed/attachment-route";
import { deliverLegacyPostMedia } from "@/lib/feed/attachment-delivery";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ postId: string; kind: string; slot: string }> },
) {
  const { postId, kind, slot } = await context.params;
  return postAttachmentRoute(request, async (uid) => {
    if (kind !== "image" && kind !== "file")
      throw new PostAttachmentError("attachment-unavailable");
    return attachmentBytesResponse(
      await deliverLegacyPostMedia(uid, postId, kind, Number(slot)),
    );
  });
}
