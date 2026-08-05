import { LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { FeedbackForm } from "@/features/marketing/feedback-form";
import { requireCurrentAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Help and feedback" };

const supportDetails = [
  {
    icon: Mail,
    title: "Direct to support",
    description: "Your message is emailed securely to VistaTeacher support.",
  },
  {
    icon: LifeBuoy,
    title: "Account, billing, or product",
    description: "Choose a category so your message reaches the right context.",
  },
  {
    icon: ShieldCheck,
    title: "Keep student data private",
    description:
      "Do not include passwords, payment details, or student records.",
  },
];

export default async function SupportPage() {
  const account = await requireCurrentAccount();

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
        <header className="max-w-2xl">
          <p className="text-primary font-mono text-[10px] font-bold uppercase">
            Support
          </p>
          <h1 className="mt-2 font-serif text-3xl">Help & feedback</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            Ask a question, report a problem, or tell us what would make
            VistaTeacher more useful. Replies go to the email address below.
          </p>
        </header>

        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <aside className="divide-y border-y">
            {supportDetails.map(({ icon: Icon, title, description }) => (
              <div key={title} className="py-5">
                <Icon aria-hidden="true" className="text-primary size-5" />
                <h2 className="mt-3 text-sm font-bold">{title}</h2>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {description}
                </p>
              </div>
            ))}
          </aside>
          <section
            aria-label="Contact VistaTeacher support"
            className="bg-card rounded-xl border p-5 sm:p-6"
          >
            <FeedbackForm
              defaultName={account.displayName ?? ""}
              defaultEmail={account.email}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
