import type { Metadata } from "next";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  alternates: { canonical: "/cookies" },
};

const sections = [
  [
    "Essential cookies",
    "VistaTeacher uses essential cookies to keep accounts signed in, protect authenticated sessions, and maintain security. These cookies are required for the service to work and cannot be disabled through the product.",
  ],
  [
    "Payments and connected services",
    "Stripe and other service providers may set cookies when you use their embedded features, such as checkout. Their use of cookies is governed by their own policies.",
  ],
  [
    "Analytics and preferences",
    "VistaTeacher does not currently use optional advertising cookies. If optional analytics or preference cookies are introduced, this policy and the relevant consent controls will be updated before they are used where consent is required.",
  ],
  [
    "Managing cookies",
    "You can remove stored cookies using your browser settings. Removing essential session cookies will sign you out and may reset preferences stored in your browser.",
  ],
];

export default function CookiePolicyPage() {
  return (
    <ContentPage
      eyebrow="Effective August 15, 2026"
      title="Cookie Policy"
      intro="This policy explains how VistaTeacher uses cookies and similar browser storage to operate the service."
    >
      <div className="max-w-3xl space-y-9">
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2 className="font-serif text-2xl">{title}</h2>
            <p className="text-muted-foreground mt-3 leading-7">{body}</p>
          </section>
        ))}
      </div>
    </ContentPage>
  );
}
