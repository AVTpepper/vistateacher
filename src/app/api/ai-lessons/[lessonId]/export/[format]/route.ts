import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRouteAccount } from "@/lib/auth/route-account";
import { createLessonExport } from "@/lib/lessons/export";
import { lessonErrorResponse } from "@/lib/lessons/route-response";
import { lessonExportFormatSchema } from "@/schemas/lesson";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; format: string }> },
) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const routeParams = await params;
  const format = lessonExportFormatSchema.safeParse(routeParams.format);
  if (!format.success)
    return NextResponse.json(
      { error: "Invalid export format." },
      { status: 400 },
    );
  try {
    const exported = await createLessonExport(
      account.uid,
      routeParams.lessonId,
      format.data,
    );
    return new NextResponse(Buffer.from(exported.bytes), {
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = lessonErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
