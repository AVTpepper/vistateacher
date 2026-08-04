import type { Metadata } from "next";

import { MessagesExperience } from "@/features/messages/messages-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import {
  getConversationSummaries,
  getMessagePage,
} from "@/lib/messages/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const account = await requireCurrentAccount();
  const conversations = await getConversationSummaries(account.uid);
  const requestedId = (await searchParams).conversation;
  const activeId =
    requestedId && conversations.some((item) => item.id === requestedId)
      ? requestedId
      : (conversations[0]?.id ?? null);
  const initialMessages = activeId
    ? await getMessagePage(account.uid, { conversationId: activeId })
    : null;
  return (
    <MessagesExperience
      viewer={{
        uid: account.uid,
        displayName: account.displayName ?? "Educator",
        photoURL: account.photoURL,
      }}
      initialConversations={conversations}
      initialConversationId={activeId}
      initialMessages={initialMessages}
    />
  );
}
