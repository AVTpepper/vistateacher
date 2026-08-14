import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/marketing/content-page";
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
];

export default function HelpPage() {
  return (
    <ContentPage
      eyebrow="Help center"
      title="Answers for getting started."
      intro="Find guidance for account access, profile privacy, and membership basics."
    >
      <div className="divide-y border-y">
        {questions.map(([question, answer]) => (
          <section className="py-6" key={question}>
            <h2 className="font-serif text-2xl">{question}</h2>
            <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
              {answer}
            </p>
          </section>
        ))}
      </div>
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
            Share a problem, ask a question, or suggest what VistaTeacher should
            improve next. Replies go to the email address you provide.
          </p>
        </div>
        <FeedbackForm />
      </section>
    </ContentPage>
  );
}
