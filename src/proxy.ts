import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { safeReturnTo } from "@/lib/auth/return-to";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const destination = safeReturnTo(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  if (destination) requestHeaders.set("x-vistateacher-return-to", destination);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/app/:path*",
    "/post/:path*",
    "/dashboard/:path*",
    "/discover/:path*",
    "/network/:path*",
    "/forum/:path*",
    "/messages/:path*",
    "/notifications/:path*",
    "/resources/:path*",
    "/ai-lessons/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/support/:path*",
    "/information/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
  ],
};
