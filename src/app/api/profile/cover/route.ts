import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { getBillingState } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase/admin";
import { coverThemeSchema } from "@/lib/profiles/cover-themes";
import { FieldValue } from "firebase-admin/firestore";

async function routeAccount(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return {
      response: NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      ),
    };
  }
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

export async function PATCH(request: NextRequest) {
  const auth = await routeAccount(request);
  if ("response" in auth) return auth.response;

  const billing = await getBillingState(auth.account.uid).catch(() => null);
  if (billing?.effectivePlan !== "plus") {
    return NextResponse.json(
      { error: "Profile cover customization requires VistaTeacher Plus." },
      { status: 403 },
    );
  }

  const parsed = coverThemeSchema.safeParse(
    (await request.json().catch(() => null))?.theme,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose one of the available cover styles." },
      { status: 400 },
    );
  }

  await adminDb().doc(`users/${auth.account.uid}`).update({
    coverTheme: parsed.data,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ coverTheme: parsed.data });
}
