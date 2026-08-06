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
  searchParams: Promise<{ conversation?: string; compose?: string }>;
}) {
  const account = await requireCurrentAccount();
  const conversations = await getConversationSummaries(account.uid);
  const params = await searchParams;
  const requestedId = params.conversation;
  const composeUid = params.compose?.trim() || null;
  const composeConversationId = composeUid
    ? (conversations.find((item) => item.participant.uid === composeUid)?.id ??
      null)
    : null;
  const activeId =
    requestedId && conversations.some((item) => item.id === requestedId)
      ? requestedId
      : composeConversationId
        ? composeConversationId
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
      initialComposeUid={composeUid && !composeConversationId ? composeUid : null}
      initialMessages={initialMessages}
    />
  );
}
