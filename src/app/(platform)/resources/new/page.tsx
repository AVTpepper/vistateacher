import type { Metadata } from "next";
import Link from "next/link";

import { ResourceCreationForm } from "@/features/resources/resource-creation-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getCreationDraft } from "@/lib/creation-drafts/server";
import { listIncompleteResources } from "@/lib/resources/server";

export const metadata: Metadata = { title: "Upload a resource" };

export default async function NewResourcePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const account = await requireCurrentAccount();
  const [savedDraft, incompleteResources, params] = await Promise.all([
    getCreationDraft(account.uid, "resource"),
    listIncompleteResources(account.uid),
    searchParams,
  ]);
  const requestedDraftId = params.draft?.trim() || savedDraft?.draftResourceId;
  const sourceDraft = incompleteResources.find(
    (item) => item.id === requestedDraftId,
  );
  const compatibleSavedDraft =
    !params.draft || savedDraft?.draftResourceId === params.draft
      ? savedDraft
      : null;

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/resources"
          className="text-muted-foreground hover:text-foreground text-sm font-semibold"
        >
          ← Back to resources
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="font-serif text-3xl">
            {sourceDraft ? "Finish resource" : "Upload resource"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Share a classroom-ready file with the details educators need to use
            it.
          </p>
        </header>
        <ResourceCreationForm
          sourceDraft={sourceDraft}
          draft={compatibleSavedDraft}
        />
      </div>
    </div>
  );
}
