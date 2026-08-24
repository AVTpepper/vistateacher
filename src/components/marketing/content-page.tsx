import { SessionAwareSiteShell } from "@/components/shared/session-aware-site-shell";

export async function ContentPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <SessionAwareSiteShell>
      <header className="border-b">
        <div className="mx-auto max-w-5xl px-5 py-16 lg:px-8 lg:py-24">
          <p className="text-primary font-mono text-xs font-bold uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-tight sm:text-6xl">
            {title}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8">
            {intro}
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-14 lg:px-8 lg:py-20">
        {children}
      </div>
    </SessionAwareSiteShell>
  );
}
