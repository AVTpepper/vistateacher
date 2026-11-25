import type { Metadata } from "next";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Effective November 25, 2026"
      title="Privacy Policy"
      intro="This policy explains the information VistaTeacher uses to operate educator accounts and community features."
    >
      <LegalSections
        sections={[
          [
            "Information we process",
            "Account identity, professional profile details, content you submit, product activity, and billing references needed to provide the service. Sensitive payment credentials are handled by Stripe and are not stored by VistaTeacher.",
          ],
          [
            "How information is used",
            "To authenticate accounts, personalize discovery, provide community tools, maintain safety, enforce limits, support users, and meet legal obligations.",
          ],
          [
            "Public and private information",
            "Professional profile information may be public. Contact details, account settings, subscription records, private messages, and saved lessons have restricted access as described by the product controls.",
          ],
          [
            "Service providers",
            "Firebase provides authentication, database, and storage infrastructure. Stripe processes billing. OpenAI processes the teaching brief and content needed when you use AI lesson or worksheet generation or refinement.",
          ],
          [
            "Optional Google Docs exports",
            "When you connect Google Drive for export, your browser requests permission for files created or opened with VistaTeacher. Your short-lived Google access token stays in browser memory. VistaTeacher stores a private export snapshot, the selected Google account identity, the document reference, and upload recovery information. Exports create a private document in your Drive without changing its sharing permissions. Your Google account or organization policies may limit this feature.",
          ],
          [
            "Community copies and Google files",
            "Community publishing during export is optional. It publishes a separate copy of the saved teaching content and the resource details you review, excluding the private teaching brief and later Google Docs edits. Publishing is immediate and subject to reporting and moderation. Removing a community resource does not delete your Google Doc. Deleting a lesson or worksheet removes its private export records; deleting your VistaTeacher account removes its app data. Neither action deletes files already created in your Google Drive. Manage those files and their sharing in Google Drive.",
          ],
          [
            "Retention and choices",
            "Information is retained while needed for the service, safety, billing, or legal obligations. You can request account deletion from account settings. Limited billing and moderation records may remain as described during deletion.",
          ],
        ]}
      />
    </ContentPage>
  );
}

function LegalSections({ sections }: { sections: string[][] }) {
  return (
    <div className="max-w-3xl space-y-9">
      {sections.map(([title, body]) => (
        <section key={title}>
          <h2 className="font-serif text-2xl">{title}</h2>
          <p className="text-muted-foreground mt-3 leading-7">{body}</p>
        </section>
      ))}
    </div>
  );
}
