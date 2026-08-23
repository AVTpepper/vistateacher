import type { Metadata } from "next";
import Link from "next/link";

import { ForumCreationForm } from "@/features/forum/forum-creation-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getCreationDraft } from "@/lib/creation-drafts/server";
import { getForumCategories } from "@/lib/forum/server";

export const metadata: Metadata = { title: "Start a discussion" };

export default async function NewForumThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const account = await requireCurrentAccount();
  const [categories, draft, params] = await Promise.all([
    getForumCategories(),
    getCreationDraft(account.uid, "forum"),
    searchParams,
  ]);
  const requestedCategory = params.category?.trim();
  const initialCategoryId =
    requestedCategory &&
    categories.some((item) => item.id === requestedCategory)
      ? requestedCategory
      : (categories[0]?.id ?? "");

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/forum"
          className="text-muted-foreground hover:text-foreground text-sm font-semibold"
        >
          ← Back to forum
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="font-serif text-3xl">Start a discussion</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose a category and add a clear title and discussion prompt.
          </p>
        </header>
        <ForumCreationForm
          categories={categories}
          initialCategoryId={initialCategoryId}
          draft={draft}
        />
      </div>
    </div>
  );
}
