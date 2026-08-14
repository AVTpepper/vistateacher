import type { NextRequest } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import { touchPresence } from "@/lib/presence/server";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const account = await getRouteAccount(request);
  if (!account)
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  await touchPresence(account.uid);
  return new Response(null, { status: 204 });
}
