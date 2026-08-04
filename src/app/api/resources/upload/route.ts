import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { resourceErrorResponse } from "@/lib/resources/route-response";
import {
  cancelResourceUpload,
  finalizeResourceUpload,
  reserveResourceUpload,
} from "@/lib/resources/server";
import {
  reserveResourceSchema,
  resourceActionSchema,
} from "@/schemas/resource";

async function accountForMutation(request: NextRequest) {
  if (!hasTrustedOrigin(request))
    return {
      response: NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      ),
    };
  const account = await getRouteAccount(request);
  return account
    ? { account }
    : {
        response: NextResponse.json(
          { error: "Authentication required." },
          { status: 401 },
        ),
      };
}

export async function POST(request: NextRequest) {
  const auth = await accountForMutation(request);
  if ("response" in auth) return auth.response;
  const parsed = reserveResourceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid resource." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await reserveResourceUpload(auth.account.uid, parsed.data),
      { status: 201 },
    );
  } catch (error) {
    const response = resourceErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

async function complete(request: NextRequest, mode: "finalize" | "cancel") {
  const auth = await accountForMutation(request);
  if ("response" in auth) return auth.response;
  const parsed = resourceActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
  try {
    if (mode === "finalize")
      await finalizeResourceUpload(auth.account.uid, parsed.data.resourceId);
    else await cancelResourceUpload(auth.account.uid, parsed.data.resourceId);
    return NextResponse.json({ completed: true });
  } catch (error) {
    const response = resourceErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  return complete(request, "finalize");
}

export async function DELETE(request: NextRequest) {
  return complete(request, "cancel");
}
