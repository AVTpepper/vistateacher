import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

export async function touchPresence(uid: string): Promise<void> {
  await adminDb().doc(`users/${uid}`).update({
    lastActiveAt: FieldValue.serverTimestamp(),
  });
}
