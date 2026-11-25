import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getWorksheet, WorksheetActionError } from "@/lib/worksheets/server";
import { WorksheetView } from "@/features/worksheets/worksheet-view";
export const metadata: Metadata = { title: "Worksheet" };
export default async function WorksheetPage({
  params,
}: {
  params: Promise<{ worksheetId: string }>;
}) {
  const account = await requireCurrentAccount();
  let worksheet;
  try {
    worksheet = await getWorksheet(account.uid, (await params).worksheetId);
  } catch (error) {
    if (error instanceof WorksheetActionError && error.code === "not-found")
      notFound();
    throw error;
  }
  return (
    <div className="page-container">
      <WorksheetView uid={account.uid} initial={worksheet} />
    </div>
  );
}
