import { NextResponse, type NextRequest } from "next/server";
import { worksheetJson, worksheetRoute } from "@/lib/worksheets/route";
import {
  deleteWorksheet,
  getWorksheet,
  updateWorksheet,
} from "@/lib/worksheets/server";
import { worksheetUpdateSchema } from "@/schemas/worksheet";

type Context = { params: Promise<{ worksheetId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  return worksheetRoute(request, async (uid) =>
    NextResponse.json(await getWorksheet(uid, (await params).worksheetId)),
  );
}
export async function PATCH(request: NextRequest, { params }: Context) {
  return worksheetRoute(request, async (uid) => {
    const { content, expectedVersion } = worksheetUpdateSchema.parse(
      await worksheetJson(request),
    );
    return NextResponse.json(
      await updateWorksheet(
        uid,
        (await params).worksheetId,
        content,
        expectedVersion,
      ),
    );
  });
}
export async function DELETE(request: NextRequest, { params }: Context) {
  return worksheetRoute(request, async (uid) => {
    await deleteWorksheet(uid, (await params).worksheetId);
    return NextResponse.json({ deleted: true });
  });
}
