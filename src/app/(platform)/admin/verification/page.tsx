import type { Metadata } from "next";

import { AdminVerificationsView } from "@/features/admin/admin-views";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import { getAdminVerifications } from "@/lib/admin/server";

export const metadata: Metadata = { title: "Verification | Administration" };

export default async function AdminVerificationPage() {
  const account = await requirePlatformAdmin();
  return (
    <AdminVerificationsView
      verifications={await getAdminVerifications(account)}
    />
  );
}
