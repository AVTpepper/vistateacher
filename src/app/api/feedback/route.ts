import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { FeedbackRateLimitError, sendFeedback } from "@/lib/feedback/server";
import { feedbackSchema } from "@/schemas/feedback";

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return (
    forwarded?.at(forwarded.length > 1 ? -2 : 0) ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const parsed = feedbackSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Review your contact details.",
      },
      { status: 400 },
    );
  }

  try {
    await sendFeedback(parsed.data, clientAddress(request));
    return NextResponse.json({ sent: true }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackRateLimitError) {
      return NextResponse.json(
        {
          error:
            "You've sent several messages today. Please try again tomorrow.",
        },
        { status: 429 },
      );
    }
    console.error("Feedback delivery failed", error);
    return NextResponse.json(
      { error: "We couldn't send your message. Please try again shortly." },
      { status: 503 },
    );
  }
}
