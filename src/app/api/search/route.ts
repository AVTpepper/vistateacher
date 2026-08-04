import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRouteAccount } from "@/lib/auth/route-account";
import { searchCommunity } from "@/lib/search/server";

export async function GET(request: NextRequest) {
  if (!(await getRouteAccount(request)))
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (query.length > 80)
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  return NextResponse.json(await searchCommunity(query));
}
