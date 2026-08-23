import type { Metadata } from "next";

import { ResourceLibrary } from "@/features/resources/resource-library";
import { requireCurrentAccount } from "@/lib/auth/session";
import { ensurePublishedLessonResources } from "@/lib/lessons/server";
import { listIncompleteResources, listResources } from "@/lib/resources/server";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage() {
  const account = await requireCurrentAccount();
  await ensurePublishedLessonResources(account.uid);
  const [resources, incompleteResources] = await Promise.all([
    listResources(
      {
        query: "",
        type: "",
        subject: "",
        sort: "downloads",
      },
      account.uid,
    ),
    listIncompleteResources(account.uid),
  ]);
  return (
    <div className="px-4 py-5 lg:px-6">
      <ResourceLibrary
        resources={resources}
        incompleteResources={incompleteResources}
      />
    </div>
  );
}
