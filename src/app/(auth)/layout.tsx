import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)]">
      <section className="bg-sidebar text-sidebar-foreground relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <Link className="font-serif text-2xl" href="/">
          VistaTeacher
        </Link>
        <blockquote className="max-w-xl font-serif text-4xl leading-tight">
          Better teaching grows through useful conversation, shared practice,
          and professional trust.
        </blockquote>
        <p className="text-sidebar-foreground/65 text-sm">
          A professional community for educators.
        </p>
      </section>
      <section className="bg-background flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link
            className="mb-10 inline-block font-serif text-xl lg:hidden"
            href="/"
          >
            VistaTeacher
          </Link>
          <div className="bg-card rounded-lg border p-6 shadow-sm sm:p-8">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
