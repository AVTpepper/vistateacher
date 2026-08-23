import "server-only";

import { adminDb } from "@/lib/firebase/admin";
import {
  forumDiscussionResults,
  type ForumSearchCandidate,
} from "@/lib/search/forum-results";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { ProfileSearchResult } from "@/types/models";

export interface GroupedSearchResults {
  educators: ProfileSearchResult[];
  resources: Array<{ id: string; title: string; type: string }>;
  discussions: Array<{ id: string; title: string; categoryId: string }>;
}

export async function searchCommunity(
  rawQuery: string,
  viewerUid?: string,
): Promise<GroupedSearchResults> {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) {
    return { educators: [], resources: [], discussions: [] };
  }

  const queryTokens = query.split(" ").filter(Boolean);
  const token =
    queryTokens.find((value) => value.length >= 2) ?? queryTokens[0];
  const db = adminDb();
  const [
    educators,
    educatorFallback,
    resources,
    resourceFallback,
    viewerResources,
    discussionKeywords,
    discussionFallback,
  ] = await Promise.all([
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
    db.collection("resources").where("status", "==", "active").limit(100).get(),
    viewerUid
      ? db
          .collection("resources")
          .where("authorId", "==", viewerUid)
          .limit(100)
          .get()
      : Promise.resolve(null),
    db
      .collection("forumThreads")
      .where("searchKeywords", "array-contains", token)
      .limit(10)
      .get(),
    db
      .collection("forumThreads")
      .where("moderationStatus", "==", "approved")
      .limit(100)
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

  const resourceResults = Array.from(
    new Map(
      [
        ...resources.docs,
        ...resourceFallback.docs,
        ...(viewerResources?.docs ?? []),
      ].map((document) => [document.id, document] as const),
    ).values(),
  )
    .filter((document) => {
      const data = document.data();
      if (data.status !== "active" || data.moderationStatus !== "approved")
        return false;
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
      const haystack = normalizeSearchText(
        [data.title, data.description, data.subject, ...tags]
          .filter((value) => typeof value === "string")
          .join(" "),
      );
      return (
        haystack.includes(query) ||
        queryTokens.some((value) => haystack.includes(value))
      );
    })
    .slice(0, 12)
    .map((document) => ({
      id: document.id,
      title: String(document.data().title),
      type: String(document.data().type ?? "Resource"),
    }));

  return {
    educators: Array.from(educatorByUid.values()).slice(0, 12),
    resources: resourceResults,
    discussions: forumDiscussionResults(
      Array.from(
        new Map(
          [...discussionKeywords.docs, ...discussionFallback.docs].map(
            (document) => {
              const data = document.data();
              const candidate: ForumSearchCandidate = {
                id: document.id,
                title: String(data.title ?? ""),
                content: String(data.content ?? ""),
                categoryId: String(data.categoryId ?? ""),
                tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
                moderationStatus: String(data.moderationStatus ?? ""),
              };
              return [document.id, candidate] as const;
            },
          ),
        ).values(),
      ),
      query,
    ),
  };
}
