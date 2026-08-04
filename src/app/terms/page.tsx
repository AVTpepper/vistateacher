import type { Metadata } from "next";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Effective August 3, 2026"
      title="Terms of Service"
      intro="These terms set the baseline rules for using VistaTeacher as a professional educator community."
    >
      <div className="max-w-3xl space-y-9">
        {[
          [
            "Account responsibilities",
            "Provide accurate account information, protect your credentials, and use the service only if you can enter this agreement.",
          ],
          [
            "Community conduct",
            "Do not harass others, impersonate educators, expose private student information, upload unlawful material, or interfere with service security.",
          ],
          [
            "Your content",
            "You retain ownership of content you submit and grant VistaTeacher the limited rights needed to host, display, and operate it through the service.",
          ],
          [
            "Subscriptions",
            "Paid features, renewal terms, and cancellation details are shown before checkout. Payment never grants educator verification or moderation privileges.",
          ],
          [
            "Service availability",
            "Features may change as the service develops. Access may be limited to protect users, comply with law, or address violations of these terms.",
          ],
          [
            "Termination",
            "You may stop using VistaTeacher at any time. Accounts may be suspended or removed for material violations, safety threats, or unlawful activity.",
          ],
        ].map(([title, body]) => (
          <section key={title}>
            <h2 className="font-serif text-2xl">{title}</h2>
            <p className="text-muted-foreground mt-3 leading-7">{body}</p>
          </section>
        ))}
      </div>
    </ContentPage>
  );
}
