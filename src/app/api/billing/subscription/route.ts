import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import {
  BillingError,
  getBillingState,
  updateSubscriptionCancellation,
} from "@/lib/billing/server";

const requestSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }
  const account = await getRouteAccount(request);
  if (!account) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid billing action." },
      { status: 400 },
    );
  }

  try {
    await updateSubscriptionCancellation(
      account.uid,
      parsed.data.cancelAtPeriodEnd,
    );
    const billing = await getBillingState(account.uid);
    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    });
  } catch (error) {
    if (!(error instanceof BillingError)) throw error;
    return NextResponse.json(
      { error: "We couldn't update your subscription.", code: error.code },
      { status: 409 },
    );
  }
}
