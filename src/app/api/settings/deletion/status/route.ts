import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDeletionReceipt } from "@/lib/accounts/deletion";

export async function GET(request: NextRequest) {
  const receipt = request.headers.get("x-deletion-receipt") ?? "";
  const result = await getDeletionReceipt(receipt);
  return NextResponse.json(result ?? { error: "Deletion receipt not found." }, {
    status: result ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
