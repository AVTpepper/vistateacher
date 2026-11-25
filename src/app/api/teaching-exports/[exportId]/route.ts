import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  claimTeachingExport,
  getTeachingExport,
  mutateTeachingExport,
} from "@/lib/teaching-exports/server";
import { teachingExportMutationSchema } from "@/schemas/teaching-export";
import { teachingExportRoute } from "@/lib/teaching-exports/route";
type Context = { params: Promise<{ exportId: string }> };
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: Context) {
  return teachingExportRoute(request, async (uid) =>
    NextResponse.json({
      job: await getTeachingExport(uid, (await params).exportId),
    }),
  );
}
export async function POST(request: NextRequest, { params }: Context) {
  return teachingExportRoute(request, async (uid) => {
    z.object({ action: z.literal("claim") })
      .strict()
      .parse(await request.json());
    return NextResponse.json(
      await claimTeachingExport(uid, (await params).exportId),
    );
  });
}
export async function PATCH(request: NextRequest, { params }: Context) {
  return teachingExportRoute(request, async (uid) =>
    NextResponse.json({
      job: await mutateTeachingExport(
        uid,
        (await params).exportId,
        teachingExportMutationSchema.parse(await request.json()),
      ),
    }),
  );
}
