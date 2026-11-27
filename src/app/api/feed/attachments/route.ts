import { NextResponse, type NextRequest } from "next/server";
import { postAttachmentRoute } from "@/lib/feed/attachment-route";
import {
  reservePostAttachment,
  reservePostAttachmentSchema,
} from "@/lib/feed/attachment-server";
export async function POST(request: NextRequest) {
  return postAttachmentRoute(request, async (uid) =>
    NextResponse.json(
      await reservePostAttachment(
        uid!,
        reservePostAttachmentSchema.parse(await request.json()),
      ),
      { status: 201 },
    ),
  );
}
