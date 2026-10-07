import type { Metadata } from "next";
import { SecuritySettings } from "@/features/auth/security-settings";
import { requireCurrentAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Login and security" };
export default async function SecurityPage() {
  const account = await requireCurrentAccount();
  return <SecuritySettings email={account.email} />;
}
