import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRouteAccount } from "@/lib/auth/route-account";
import { resourceErrorResponse } from "@/lib/resources/route-response";
import { downloadResource } from "@/lib/resources/server";
import { resourceActionSchema } from "@/schemas/resource";

function safeDownloadName(value: string): string {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "resource";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const parsed = resourceActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
  try {
    const download = await downloadResource(
      account.uid,
      parsed.data.resourceId,
    );
    return new NextResponse(new Uint8Array(download.bytes), {
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": `attachment; filename="${safeDownloadName(download.fileName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = resourceErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
