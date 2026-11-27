import { NextResponse, type NextRequest } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import {
  contentReportErrorResponse,
  reportPublicContent,
} from "@/lib/community/reporting";
import { resourceReportSchema } from "@/schemas/report";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  const parsed = resourceReportSchema.safeParse({
    ...(typeof body === "object" && body ? body : {}),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  try {
    await reportPublicContent(
      account.uid,
      "resource",
      parsed.data.resourceId,
      parsed.data,
    );
    return NextResponse.json({ reported: true }, { status: 201 });
  } catch (error) {
    const response = contentReportErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
