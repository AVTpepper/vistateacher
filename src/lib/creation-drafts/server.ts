import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import {
  creationDraftSchemas,
  type CreationDraftMap,
  type CreationDraftType,
} from "@/schemas/creation-draft";

function draftReference(uid: string, type: CreationDraftType) {
  return adminDb().doc(`users/${uid}/creationDrafts/${type}`);
}

export async function getCreationDraft<T extends CreationDraftType>(
  uid: string,
  type: T,
): Promise<CreationDraftMap[T] | null> {
  const snapshot = await draftReference(uid, type).get();
  if (!snapshot.exists) return null;
  const parsed = creationDraftSchemas[type].safeParse(snapshot.data()?.data);
  return parsed.success ? (parsed.data as CreationDraftMap[T]) : null;
}

export async function saveCreationDraft<T extends CreationDraftType>(
  uid: string,
  type: T,
  data: CreationDraftMap[T],
): Promise<void> {
  await draftReference(uid, type).set({
    type,
    data,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function deleteCreationDraft(
  uid: string,
  type: CreationDraftType,
): Promise<void> {
  await draftReference(uid, type).delete();
}
