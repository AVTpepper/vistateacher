import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { worksheetRoute } from "@/lib/worksheets/route";
import { createWorksheetExport } from "@/lib/worksheets/export";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ worksheetId: string; format: string }> },
) {
  return worksheetRoute(request, async (uid) => {
    const route = await params;
    const format = z.enum(["pdf", "docx"]).parse(route.format);
    const mode = z
      .enum(["student", "key"])
      .parse(request.nextUrl.searchParams.get("mode") ?? "student");
    const result = await createWorksheetExport(
      uid,
      route.worksheetId,
      format,
      mode,
    );
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
