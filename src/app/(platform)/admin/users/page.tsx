import type { Metadata } from "next";

import { AdminUsersView } from "@/features/admin/admin-views";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminUsers } from "@/lib/admin/server";

export const metadata: Metadata = { title: "Users | Administration" };

export default async function AdminUsersPage() {
  const account = await requirePlatformAdmin();
  return <AdminUsersView users={await getAdminUsers(account)} />;
}
