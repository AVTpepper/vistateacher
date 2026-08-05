import type { Metadata } from "next";

import { ProfileEditForm } from "@/features/profiles/profile-edit-form";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getProfileView } from "@/lib/profiles/server";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const account = await requireCurrentAccount();
  const data = await getProfileView(account.uid, account.uid);
  if (!data) return null;
  const { profile } = data;
  return (
    <section className="bg-card rounded-xl border p-6">
      <h2 className="font-serif text-xl">Professional profile</h2>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Keep the context other educators use to find and understand your work.
      </p>
      <ProfileEditForm
        initialCoverImageURL={profile.coverImageURL}
        plan={data.plan}
        initial={{
          displayName: profile.displayName,
          professionalRoles: profile.professionalRoles,
          gradeLevel: profile.gradeLevel,
          subjects: profile.subjects,
          languages: profile.languages,
          country: profile.country,
          city: profile.city,
          school: profile.school,
          yearsOfExperience: profile.yearsOfExperience,
          bio: profile.bio,
          website: profile.website,
          interests: profile.interests,
        }}
      />
    </section>
  );
}
