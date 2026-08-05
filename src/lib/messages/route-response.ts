import { NextResponse } from "next/server";

import { MessageActionError } from "@/lib/messages/server";

export function messageErrorResponse(error: unknown) {
  if (!(error instanceof MessageActionError)) return null;
  const responses: Record<
    MessageActionError["code"],
    { status: number; message: string }
  > = {
    inactive: { status: 403, message: "This account cannot send messages." },
    "not-found": { status: 404, message: "Messaging item not found." },
    "not-member": { status: 403, message: "Conversation access denied." },
    "self-message": { status: 400, message: "Choose another educator." },
    blocked: {
      status: 409,
      message: "Messaging is unavailable for this conversation.",
    },
    "limit-reached": {
      status: 429,
      message: "Your daily message limit has been reached.",
    },
    "invalid-cursor": { status: 400, message: "Invalid pagination cursor." },
    "invalid-attachment": {
      status: 400,
      message: "The attachment could not be verified.",
    },
    "not-owner": {
      status: 403,
      message: "You can only edit or delete your own messages.",
    },
    "already-reported": {
      status: 409,
      message: "You already reported this message.",
    },
  };
  const response = responses[error.code];
  return NextResponse.json(
    { error: response.message, code: error.code },
    { status: response.status },
  );
}
