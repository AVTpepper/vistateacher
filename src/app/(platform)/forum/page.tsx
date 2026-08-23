import type { Metadata } from "next";

import { ForumExperience } from "@/features/forum/forum-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getForumCategories, getForumPage } from "@/lib/forum/server";

export const metadata: Metadata = { title: "Forum" };

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const [account, params, categories] = await Promise.all([
    requireCurrentAccount(),
    searchParams,
    getForumCategories(),
  ]);
  const rawCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const selectedCategory = categories.find(
    (category) => category.id === rawCategory,
  );
  const showThreads = rawCategory === "all" || Boolean(selectedCategory);
  const initialPage = showThreads
    ? await getForumPage(account.uid, account.role, {
        categoryId: selectedCategory?.id ?? "",
        query: "",
        cursor: undefined,
      })
    : { threads: [], nextCursor: null };
  return (
    <div className="px-4 py-5 lg:px-6">
      <ForumExperience
        key={selectedCategory?.id ?? (showThreads ? "all" : "categories")}
        categories={categories}
        initialPage={initialPage}
        selectedCategory={selectedCategory ?? null}
        showThreads={showThreads}
      />
    </div>
  );
}
