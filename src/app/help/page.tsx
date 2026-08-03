import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/marketing/content-page";

export const metadata: Metadata = { title: "Help" };

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
    </ContentPage>
  );
}
