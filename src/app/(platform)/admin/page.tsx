import type { Metadata } from "next";

import { AdminOverviewView } from "@/features/admin/admin-views";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/server";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage() {
  const account = await requirePlatformAdmin();
  return <AdminOverviewView overview={await getAdminOverview(account)} />;
}
