import type { Metadata } from "next";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="Why VistaTeacher"
      title="Professional community, shaped around teaching."
      intro="VistaTeacher gives educators a focused place to exchange practical knowledge without turning their work into a popularity contest."
    >
      <div className="grid gap-10 md:grid-cols-3">
        {[
          [
            "Practice first",
            "Conversation starts with classroom context and useful experience.",
          ],
          [
            "Trust by design",
            "Professional identity, privacy controls, and moderation support safer exchange.",
          ],
          [
            "Tools in context",
            "Resources, discussion, messaging, and planning belong in one connected workflow.",
          ],
        ].map(([title, copy]) => (
          <section key={title} className="border-t pt-5">
            <h2 className="font-serif text-2xl">{title}</h2>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {copy}
            </p>
          </section>
        ))}
      </div>
    </ContentPage>
  );
}
