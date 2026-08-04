import type { Metadata } from "next";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Effective August 3, 2026"
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
            "Firebase provides authentication, database, and storage infrastructure. Stripe processes billing. OpenAI processes lesson-generation prompts only when that feature is used.",
          ],
          [
            "Retention and choices",
            "Information is retained while needed for the service, safety, billing, or legal obligations. Account deletion requests can be made from account settings when that workflow is available.",
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
