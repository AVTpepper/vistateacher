import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { worksheetJson, worksheetRoute } from "@/lib/worksheets/route";
import {
  createWorksheet,
  getWorksheetWorkspace,
} from "@/lib/worksheets/server";
import { worksheetCreateSchema } from "@/schemas/worksheet";

export async function GET(request: NextRequest) {
  return worksheetRoute(request, async (uid) => {
    const cursor = z
      .string()
      .regex(/^[\w-]{1,128}$/)
      .optional()
      .parse(request.nextUrl.searchParams.get("cursor") ?? undefined);
    return NextResponse.json(await getWorksheetWorkspace(uid, cursor));
  });
}
export async function POST(request: NextRequest) {
  return worksheetRoute(request, async (uid) => {
    const { source, requestId } = worksheetCreateSchema.parse(
      await worksheetJson(request),
    );
    return NextResponse.json(await createWorksheet(uid, source, requestId), {
      status: 201,
    });
  });
}
