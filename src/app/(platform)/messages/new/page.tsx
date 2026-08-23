import type { Metadata } from "next";
import Link from "next/link";

import { NewConversationForm } from "@/features/messages/new-conversation-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getCreationDraft } from "@/lib/creation-drafts/server";

export const metadata: Metadata = { title: "New conversation" };

export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ recipient?: string }>;
}) {
  const account = await requireCurrentAccount();
  const [draft, params] = await Promise.all([
    getCreationDraft(account.uid, "message"),
    searchParams,
  ]);

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/messages"
          className="text-muted-foreground hover:text-foreground text-sm font-semibold"
        >
          ← Back to messages
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="font-serif text-3xl">New conversation</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Find an educator and send the first message.
          </p>
        </header>
        <NewConversationForm
          viewerUid={account.uid}
          initialRecipientUid={params.recipient?.trim() || null}
          draft={draft}
        />
      </div>
    </div>
  );
}
