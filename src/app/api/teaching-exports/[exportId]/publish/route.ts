import { NextResponse, type NextRequest } from "next/server";
import { publishTeachingExport } from "@/lib/teaching-exports/server";
import { teachingExportPublishSchema } from "@/schemas/teaching-export";
import { teachingExportRoute } from "@/lib/teaching-exports/route";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  return teachingExportRoute(request, async (uid) =>
    NextResponse.json(
      await publishTeachingExport(
        uid,
        (await params).exportId,
        teachingExportPublishSchema.parse(await request.json()),
      ),
    ),
  );
}
