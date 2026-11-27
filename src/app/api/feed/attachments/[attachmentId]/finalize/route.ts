import { NextResponse, type NextRequest } from "next/server";
import { postAttachmentRoute } from "@/lib/feed/attachment-route";
import { finalizePostAttachment } from "@/lib/feed/attachment-server";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  return postAttachmentRoute(request, async (uid) =>
    NextResponse.json(await finalizePostAttachment(uid!, attachmentId)),
  );
}
