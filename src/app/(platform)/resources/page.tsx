import type { Metadata } from "next";

import { ResourceLibrary } from "@/features/resources/resource-library";
import { requireCurrentAccount } from "@/lib/auth/session";
import { listResources } from "@/lib/resources/server";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage() {
  await requireCurrentAccount();
  const resources = await listResources({
    query: "",
    type: "",
    subject: "",
    sort: "downloads",
  });
  return (
    <div className="px-4 py-5 lg:px-6">
      <ResourceLibrary resources={resources} />
    </div>
  );
}
