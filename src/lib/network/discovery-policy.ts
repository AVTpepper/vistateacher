import { normalizeSearchText } from "@/lib/search/normalize";
import type { DiscoveryFilters } from "@/schemas/network";
import type { ProfileDocument } from "@/schemas/profile";

export function matchesDiscoveryFilters(
  profile: ProfileDocument,
  filters: DiscoveryFilters,
): boolean {
  const query = normalizeSearchText(filters.query);
  const subject = normalizeSearchText(filters.subject);
  const grade = normalizeSearchText(filters.grade);
  const location = normalizeSearchText(filters.location);
  const searchable = normalizeSearchText(
    [
      profile.displayName,
      profile.school,
      profile.city,
      profile.country,
      ...profile.professionalRoles,
      ...profile.subjects,
      ...profile.languages,
      ...profile.interests,
    ].join(" "),
  );

  return (
    (!query || searchable.includes(query)) &&
    (!subject ||
      profile.subjects.some(
        (value) => normalizeSearchText(value) === subject,
      )) &&
    (!grade || normalizeSearchText(profile.gradeLevel) === grade) &&
    (!location ||
      normalizeSearchText(`${profile.city} ${profile.country}`).includes(
        location,
      )) &&
    (!filters.verified || profile.isVerified)
  );
}
