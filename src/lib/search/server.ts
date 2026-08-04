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
  const db = adminDb();
  const [educators, resources, discussions] = await Promise.all([
    db
      .collection("users")
      .where("searchKeywords", "array-contains", token)
      .limit(5)
      .get(),
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

  return {
    educators: educators.docs
      .map((document) => document.data())
      .filter((data) => data.status === "active")
      .map((data) => ({
        uid: String(data.uid),
        displayName: String(data.displayName),
        photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
        gradeLevel: String(data.gradeLevel ?? "Educator"),
        subjects: Array.isArray(data.subjects) ? data.subjects.map(String) : [],
        school: String(data.school ?? ""),
        city: String(data.city ?? ""),
        isVerified: data.isVerified === true,
      })),
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
