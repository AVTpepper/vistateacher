import { NextResponse, type NextRequest } from "next/server";
import { createTeachingExport } from "@/lib/teaching-exports/server";
import { teachingExportCreateSchema } from "@/schemas/teaching-export";
import { teachingExportRoute } from "@/lib/teaching-exports/route";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return teachingExportRoute(request, async (uid) =>
    NextResponse.json({
      job: await createTeachingExport(
        uid,
        teachingExportCreateSchema.parse(await request.json()),
      ),
    }),
  );
}
