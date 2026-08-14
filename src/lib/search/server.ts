import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { ProfileSearchResult } from "@/types/models";

export interface GroupedSearchResults {
  educators: ProfileSearchResult[];
  resources: Array<{ id: string; title: string; type: string }>;
  discussions: Array<{ id: string; title: string; categoryId: string }>;
}

export async function searchCommunity(
  rawQuery: string,
): Promise<GroupedSearchResults> {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) {
    return { educators: [], resources: [], discussions: [] };
  }

  const token = query.split(" ")[0];
  const queryTokens = query.split(" ").filter(Boolean);
  const db = adminDb();
  const [educators, educatorFallback, resources, discussions] =
    await Promise.all([
      db
        .collection("users")
        .where("searchKeywords", "array-contains", token)
        .limit(20)
        .get(),
      db.collection("users").limit(80).get(),
      db
        .collection("resources")
        .where("tags", "array-contains", token)
        .limit(5)
        .get(),
      db
        .collection("forumThreads")
        .where("tags", "array-contains", token)
        .limit(5)
        .get(),
    ]);

  const educatorByUid = new Map<string, ProfileSearchResult>();
  const upsertEducator = (
    document: FirebaseFirestore.QueryDocumentSnapshot,
  ) => {
    const data = document.data();
    const status = String(data.status ?? "active");
    if (status === "suspended" || status === "deleted") return;

    const uid = String(data.uid ?? document.id);
    const displayName = String(data.displayName ?? "").trim();
    if (!uid || !displayName) return;

    const subjects = Array.isArray(data.subjects)
      ? data.subjects.map(String)
      : [];
    const haystack = normalizeSearchText(
      [displayName, data.school, data.city, data.gradeLevel, ...subjects]
        .filter((value) => typeof value === "string" || Array.isArray(value))
        .join(" "),
    );
    if (
      !haystack.includes(query) &&
      !queryTokens.some((value) => haystack.includes(value))
    ) {
      return;
    }

    educatorByUid.set(uid, {
      uid,
      displayName,
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      gradeLevel: String(data.gradeLevel ?? "Educator"),
      subjects,
      school: String(data.school ?? ""),
      city: String(data.city ?? ""),
      isVerified: data.isVerified === true,
    });
  };

  educators.docs.forEach(upsertEducator);
  educatorFallback.docs.forEach(upsertEducator);

  return {
    educators: Array.from(educatorByUid.values()).slice(0, 12),
    resources: resources.docs
      .filter((document) => document.data().moderationStatus === "approved")
      .map((document) => ({
        id: document.id,
        title: String(document.data().title),
        type: String(document.data().type ?? "Resource"),
      })),
    discussions: discussions.docs
      .filter((document) => document.data().moderationStatus === "approved")
      .map((document) => ({
        id: document.id,
        title: String(document.data().title),
        categoryId: String(document.data().categoryId ?? ""),
      })),
  };
}
