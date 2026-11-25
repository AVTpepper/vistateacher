import type { Metadata } from "next";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getWorksheetWorkspace } from "@/lib/worksheets/server";
import { WorksheetList } from "@/features/worksheets/worksheet-list";
export const metadata: Metadata = { title: "Worksheets" };
export default async function WorksheetsPage() {
  const account = await requireCurrentAccount();
  return (
    <div className="page-container">
      <WorksheetList initial={await getWorksheetWorkspace(account.uid)} />
    </div>
  );
}
