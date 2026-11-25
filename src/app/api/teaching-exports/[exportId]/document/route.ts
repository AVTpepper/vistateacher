import { NextResponse, type NextRequest } from "next/server";
import { getTeachingExportBytes } from "@/lib/teaching-exports/server";
import { teachingExportRoute } from "@/lib/teaching-exports/route";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  return teachingExportRoute(request, async (uid) => {
    const result = await getTeachingExportBytes(uid, (await params).exportId);
    return new NextResponse(result.bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "X-Document-SHA256": result.hash,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
