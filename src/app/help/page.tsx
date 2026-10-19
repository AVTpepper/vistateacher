import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/marketing/content-page";
import { MarketingFlow } from "@/components/marketing/marketing-flow";
import { StoryCarousel } from "@/components/marketing/story-carousel";
import { FeedbackForm } from "@/features/marketing/feedback-form";

export const metadata: Metadata = {
  title: "Help",
  alternates: { canonical: "/help" },
};

const questions = [
  [
    "How do I verify my email?",
    "Open the message sent after registration and follow its verification link. Return to VistaTeacher and confirm verification.",
  ],
  [
    "Can I reset my password?",
    "Use the Forgot password link on sign in. Firebase sends the reset link directly to your account email.",
  ],
  [
    "What information is public?",
    "Your educator profile is public. Contact details and account preferences are stored separately and remain private by default.",
  ],
  [
    "Can payment verify my educator status?",
    "No. Subscription status and educator verification are independent.",
  ],
  [
    "When does Plus renew?",
    "Plus renews automatically each month or year on the date shown in Plan & billing. An upcoming-renewal email is sent before Stripe attempts the charge.",
  ],
  [
    "What happens if a payment fails?",
    "Plus remains available while Stripe retries a past-due payment. VistaTeacher will show an account banner and send an essential billing email so you can update the payment method before access is interrupted.",
  ],
  [
    "Where are invoices and receipts?",
    "Open Plan & billing, then choose Payment methods, invoices & receipts to continue securely to Stripe. VistaTeacher also emails a receipt after each paid invoice.",
  ],
  [
    "How do cancellation and refunds work?",
    "Turning off renewal keeps Plus active through the paid billing period. Refund requests are reviewed case by case through support, subject to rights required by applicable law.",
  ],
];

export default function HelpPage() {
  return (
    <ContentPage
      eyebrow="Help center"
      title="Answers for getting started."
      intro="Find guidance for account access, profile privacy, and membership basics."
    >
      <MarketingFlow>
        <section aria-labelledby="help-topics-heading">
          <p className="text-accent-readable text-xs font-bold tracking-widest uppercase">
            A little guidance goes a long way
          </p>
          <h2
            id="help-topics-heading"
            className="mt-3 mb-8 font-serif text-3xl sm:text-4xl"
          >
            Find your next step.
          </h2>
          <StoryCarousel
            label="Find the help you need"
            cards={[
              {
                icon: "people",
                eyebrow: "Get back to your community",
                title: "Account access",
                description:
                  "Getting started or having trouble signing in? Verify your email after registration, or request a password reset to return to your account.",
                tags: ["Sign in", "Email verification", "Password reset"],
                href: "/forgot-password",
                linkLabel: "Reset your password",
              },
              {
                icon: "chat",
                eyebrow: "Share on your terms",
                title: "Privacy and your profile",
                description:
                  "Your educator profile helps others get to know your work. Contact details stay private by default, and privacy settings let you choose what to share.",
                tags: ["Your profile", "Contact privacy", "Your choices"],
                href: "/privacy",
                linkLabel: "Read our privacy guidance",
              },
              {
                icon: "sparkles",
                eyebrow: "Choose what fits your work",
                title: "Membership and billing",
                description:
                  "Start with Community, or choose Plus for more AI planning capacity and additional tools. Find answers about renewal, payment methods, cancellation, and receipts below.",
                tags: ["Community", "Plus", "Billing support"],
                href: "/pricing",
                linkLabel: "Explore the plans",
              },
            ]}
          />
        </section>
        <section className="mt-12" aria-labelledby="help-questions-heading">
          <h2 id="help-questions-heading" className="mb-6 font-serif text-3xl">
            Frequently asked questions
          </h2>
          <div className="flow-faq divide-y rounded-2xl border px-5 sm:px-7">
            {questions.map(([question, answer]) => (
              <details className="py-5" key={question}>
                <summary className="cursor-pointer text-base font-bold">
                  <h3 className="inline">{question}</h3>
                </summary>
                <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-7">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>
        <p className="mt-8 text-sm">
          Having trouble accessing your account? Begin with{" "}
          <Link
            className="text-primary font-bold hover:underline"
            href="/forgot-password"
          >
            password reset
          </Link>
          .
        </p>
        <section className="mt-14 grid gap-8 border-t pt-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-14">
          <div>
            <p className="text-accent-readable font-mono text-xs font-bold uppercase">
              Contact and feedback
            </p>
            <h2 className="mt-3 font-serif text-3xl">Tell us what you need.</h2>
            <p className="text-muted-foreground mt-4 text-sm leading-6">
              Share a problem, ask a question, or suggest what VistaTeacher
              should improve next. Replies go to the email address you provide.
            </p>
          </div>
          <FeedbackForm />
        </section>
      </MarketingFlow>
    </ContentPage>
  );
}
