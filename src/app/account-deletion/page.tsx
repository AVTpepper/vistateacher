import type { Metadata } from "next";
import { DeletionStatusPanel } from "@/features/profiles/deletion-status";
export const metadata: Metadata = {
  title: "Account deletion",
  robots: { index: false, follow: false },
};
export default function AccountDeletionPage() {
  return (
    <main className="page-container py-12">
      <DeletionStatusPanel />
    </main>
  );
}
