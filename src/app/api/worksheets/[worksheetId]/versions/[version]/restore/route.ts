import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { worksheetJson, worksheetRoute } from "@/lib/worksheets/route";
import { restoreWorksheetVersion } from "@/lib/worksheets/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ worksheetId: string; version: string }> },
) {
  return worksheetRoute(request, async (uid) => {
    const route = await params;
    const version = z.coerce.number().int().min(1).parse(route.version);
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().min(1) })
      .parse(await worksheetJson(request));
    return NextResponse.json(
      await restoreWorksheetVersion(
        uid,
        route.worksheetId,
        version,
        expectedVersion,
      ),
    );
  });
}
