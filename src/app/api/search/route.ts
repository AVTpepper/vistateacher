import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRouteAccount } from "@/lib/auth/route-account";
import { ensurePublishedLessonResources } from "@/lib/lessons/server";
import { searchCommunity } from "@/lib/search/server";

export async function GET(request: NextRequest) {
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (query.length > 80)
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  await ensurePublishedLessonResources(account.uid);
  return NextResponse.json(await searchCommunity(query, account.uid));
}
