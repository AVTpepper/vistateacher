import "server-only";

import { publicResourceIds } from "@/lib/community/visibility";
import { adminDb } from "@/lib/firebase/admin";

/** Both profile entry points use the same canonical public-resource policy. */
export async function getPublicProfileResources(authorId: string) {
  const snapshot = await adminDb()
    .collection("resources")
    .where("authorId", "==", authorId)
    .where("moderationStatus", "==", "approved")
    .get();
  const visible = await publicResourceIds(snapshot.docs);
  return snapshot.docs
    .filter((document) => visible.has(document.id))
    .sort(
      (left, right) =>
        Number(right.data().createdAt?.toMillis?.() ?? 0) -
        Number(left.data().createdAt?.toMillis?.() ?? 0),
    )
    .map((document) => ({
      id: document.id,
      title: String(document.data().title),
      type: String(document.data().type ?? "Resource"),
    }));
}
