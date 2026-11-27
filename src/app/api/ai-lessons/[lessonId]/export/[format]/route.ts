import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createLessonExport } from "@/lib/lessons/export";
import { UnsupportedPdfTextError } from "@/lib/documents/pdf";
import { lessonRoute } from "@/lib/lessons/route-response";
import { lessonActionSchema, lessonExportFormatSchema } from "@/schemas/lesson";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; format: string }> },
) {
  return lessonRoute(request, async (uid) => {
    const routeParams = await params;
    const { lessonId } = lessonActionSchema.parse(routeParams);
    const format = lessonExportFormatSchema.safeParse(routeParams.format);
    if (!format.success)
      return NextResponse.json(
        { error: "Invalid export format." },
        { status: 400 },
      );
    try {
      const preview = request.nextUrl.searchParams.get("preview") === "1";
      if (preview && format.data !== "pdf")
        return NextResponse.json(
          { error: "Preview is currently available for PDF only." },
          { status: 400 },
        );
      const exported = await createLessonExport(uid, lessonId, format.data);
      return new NextResponse(Buffer.from(exported.bytes), {
        headers: {
          "Content-Type": exported.contentType,
          "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${exported.fileName}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof UnsupportedPdfTextError)
        return NextResponse.json(
          { error: error.message, code: "unsupported-pdf-text" },
          { status: 422 },
        );
      throw error;
    }
  });
}
