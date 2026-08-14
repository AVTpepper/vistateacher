import type { Metadata } from "next";

import { MarketingHeader } from "@/components/marketing/marketing-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)]">
        <section className="bg-sidebar text-sidebar-foreground relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-center">
          <blockquote className="max-w-xl font-serif text-4xl leading-tight">
            Better teaching grows through useful conversation, shared practice,
            and professional trust.
          </blockquote>
          <p className="text-sidebar-foreground/75 absolute bottom-12 text-sm">
            A professional community for educators.
          </p>
        </section>
        <section className="bg-background flex items-center justify-center px-5 py-12">
          <div className="w-full max-w-md">
            <div className="surface-card p-6 sm:p-8">{children}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
