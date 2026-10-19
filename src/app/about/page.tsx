import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFlow } from "@/components/marketing/marketing-flow";
import { StoryCarousel } from "@/components/marketing/story-carousel";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = {
  title: "About",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="Why VistaTeacher"
      title="Professional community, shaped around teaching."
      intro="VistaTeacher gives educators a focused place to exchange practical knowledge without turning their work into a popularity contest."
    >
      <MarketingFlow>
        <section aria-labelledby="about-values-heading">
          <p className="text-accent-readable text-xs font-bold tracking-widest uppercase">
            People before platforms
          </p>
          <h2
            id="about-values-heading"
            className="mt-3 font-serif text-3xl sm:text-4xl"
          >
            What brings us together.
          </h2>
          <p className="text-muted-foreground mt-4 mb-8 max-w-2xl leading-7">
            A useful conversation. A shared resource. A fresh way to approach
            tomorrow. Small exchanges can make a real difference to your working
            day.
          </p>
          <StoryCarousel
            label="The VistaTeacher approach"
            cards={[
              {
                icon: "people",
                eyebrow: "Start with the everyday",
                title: "Practice first",
                description:
                  "Conversation starts with classroom context and useful experience. Meet teachers, educators, and coaches who understand the work, and bring your own perspective to the conversation.",
                tags: [
                  "Shared experience",
                  "Practical ideas",
                  "Your perspective",
                ],
              },
              {
                icon: "chat",
                eyebrow: "Make room for trust",
                title: "Trust by design",
                description:
                  "Professional identity, privacy controls, and moderation support safer exchange. Choose what you share, build relationships at your own pace, and keep your professional boundaries.",
                tags: [
                  "Privacy controls",
                  "Professional identity",
                  "Thoughtful exchange",
                ],
              },
              {
                icon: "book",
                eyebrow: "Keep the good ideas connected",
                title: "Tools in context",
                description:
                  "Resources, discussion, messaging, and planning belong in one connected workflow. Move from a conversation to a useful resource or a lesson idea without losing the context that made it valuable.",
                tags: ["Connect", "Share", "Prepare"],
              },
            ]}
          />
        </section>
        <section
          className="bg-card mt-12 rounded-3xl border p-7 sm:p-10"
          aria-labelledby="about-invitation-heading"
        >
          <h2 id="about-invitation-heading" className="font-serif text-3xl">
            Bring your experience. Find a new perspective.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl leading-7">
            You do not need a polished personal brand to belong here. Start with
            what you teach, what you are curious about, and the people you would
            like to learn alongside.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sign-up" className="story-action mt-0">
              Create your free profile
            </Link>
            <Link
              href="/help"
              className="text-primary inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold underline decoration-current underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Have a question?
            </Link>
          </div>
        </section>
      </MarketingFlow>
    </ContentPage>
  );
}
