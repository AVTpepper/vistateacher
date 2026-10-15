import type { Metadata } from "next";

import { ResourceLibrary } from "@/features/resources/resource-library";
import { requireCurrentAccount } from "@/lib/auth/session";
import { ensurePublishedLessonResources } from "@/lib/lessons/server";
import {
  listIncompleteResources,
  listOwnedResources,
  listResources,
} from "@/lib/resources/server";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const mine = (await searchParams).view === "mine";
  const account = await requireCurrentAccount();
  await ensurePublishedLessonResources(account.uid);
  const [resources, incompleteResources] = await Promise.all([
    mine
      ? listOwnedResources(account.uid)
      : listResources(
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
    <div className="page-container">
      <ResourceLibrary
        key={mine ? "mine" : "all"}
        mine={mine}
        resources={resources}
        incompleteResources={incompleteResources}
      />
    </div>
  );
}
