import { NextResponse, type NextRequest } from "next/server";
import { worksheetJson, worksheetRoute } from "@/lib/worksheets/route";
import { regenerateWorksheet } from "@/lib/worksheets/server";
import { worksheetRegenerateSchema } from "@/schemas/worksheet";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ worksheetId: string }> },
) {
  return worksheetRoute(request, async (uid) => {
    const { expectedVersion, requestId } = worksheetRegenerateSchema.parse(
      await worksheetJson(request),
    );
    return NextResponse.json(
      await regenerateWorksheet(
        uid,
        (await params).worksheetId,
        expectedVersion,
        requestId,
      ),
    );
  });
}
