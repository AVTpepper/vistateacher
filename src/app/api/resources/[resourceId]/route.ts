import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { resourceErrorResponse } from "@/lib/resources/route-response";
import { deleteResource, updateResource } from "@/lib/resources/server";
import { resourceActionSchema, updateResourceSchema } from "@/schemas/resource";

export async function PATCH(
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
  const parsed = updateResourceSchema.safeParse({
    ...(await request.json().catch(() => null)),
    ...(await params),
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid resource." },
      { status: 400 },
    );
  try {
    await updateResource(account.uid, parsed.data);
    return NextResponse.json({ updated: true });
  } catch (error) {
    const response = resourceErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
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
  const parsed = resourceActionSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
  try {
    await deleteResource(account.uid, parsed.data.resourceId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = resourceErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
