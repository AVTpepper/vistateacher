import type { NextRequest } from "next/server";
import {
  attachmentBytesResponse,
  postAttachmentRoute,
} from "@/lib/feed/attachment-route";
import { deliverPostAttachment } from "@/lib/feed/attachment-delivery";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  return postAttachmentRoute(request, async (uid) =>
    attachmentBytesResponse(await deliverPostAttachment(uid, attachmentId)),
  );
}
