import type { Metadata } from "next";

import { ForumExperience } from "@/features/forum/forum-experience";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getForumCategories, getForumPage } from "@/lib/forum/server";

export const metadata: Metadata = { title: "Forum" };

export default async function ForumPage() {
  const account = await requireCurrentAccount();
  const [categories, initialPage] = await Promise.all([
    getForumCategories(),
    getForumPage(account.uid, account.role, {
      categoryId: "",
      cursor: undefined,
    }),
  ]);
  return (
    <main className="h-full overflow-y-auto px-4 py-5 lg:px-6">
      <ForumExperience categories={categories} initialPage={initialPage} />
    </main>
  );
}
