import type { Metadata } from "next";

import { AdminContentView } from "@/features/admin/admin-views";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminContent } from "@/lib/admin/server";

export const metadata: Metadata = { title: "Content | Administration" };

export default async function AdminContentPage() {
  const account = await requirePlatformAdmin();
  return <AdminContentView content={await getAdminContent(account)} />;
}
