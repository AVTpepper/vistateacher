import { redirect } from "next/navigation";

import { requireCurrentAccount } from "@/lib/auth/session";

export default async function MyProfileRedirect() {
  const account = await requireCurrentAccount();
  redirect(`/profile/${account.uid}`);
}
