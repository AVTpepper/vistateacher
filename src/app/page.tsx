import {
  ArrowRight,
  BookOpenText,
  MessageCircleMore,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const features = [
  {
    icon: UsersRound,
    title: "A purposeful network",
    description:
      "Find educators by subject, grade, location, and the teaching questions that matter to you.",
  },
  {
    icon: BookOpenText,
    title: "Resources with context",
    description:
      "Share classroom-ready materials and learn how other teachers put them into practice.",
  },
  {
    icon: MessageCircleMore,
    title: "Professional conversation",
    description:
      "Move from a useful forum exchange to a direct conversation without leaving the community.",
  },
  {
    icon: Sparkles,
    title: "Thoughtful lesson support",
    description:
      "Build structured lesson plans, adapt them for learners, and export them for the classroom.",
  },
];

export default function Home() {
  return (
    <div className="bg-background min-h-screen overflow-x-hidden">
      <header className="bg-background/92 sticky top-0 z-50 border-b backdrop-blur-md">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8"
        >
          <Link
            href="/"
            className="text-foreground flex items-center gap-2 rounded-md font-serif text-xl"
          >
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg font-sans text-sm font-bold"
            >
              VT
            </span>
            VistaTeacher
          </Link>
          <div className="hidden items-center gap-7 text-sm font-semibold md:flex">
            <Link className="hover:text-primary rounded-sm" href="#features">
              Features
            </Link>
            <Link className="hover:text-primary rounded-sm" href="#community">
              Community
            </Link>
            <Link className="hover:text-primary rounded-sm" href="#pricing">
              Pricing
            </Link>
          </div>
          <Button asChild size="sm">
            <Link href="#pricing">Explore plans</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="relative isolate border-b">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_18%,rgba(74,159,192,0.18),transparent_30%),radial-gradient(circle_at_88%_72%,rgba(224,120,66,0.16),transparent_28%)]"
          />
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl content-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            <div className="max-w-2xl self-center">
              <p className="text-primary mb-5 font-mono text-xs font-semibold tracking-widest uppercase">
                Professional community for educators
              </p>
              <h1 className="text-foreground max-w-xl font-serif text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">
                The network built for teachers.
              </h1>
              <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
                Exchange practical ideas, discover trusted resources, and turn
                thoughtful conversations into better classroom experiences.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="#community">
                    Explore the community <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="#features">See what you can do</Link>
                </Button>
              </div>
            </div>

            <div
              aria-label="Preview of a VistaTeacher community feed"
              className="relative mx-auto w-full max-w-xl self-center"
            >
              <div className="bg-card rounded-2xl border p-3 shadow-[0_24px_80px_rgba(15,37,53,0.12)] sm:p-5">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <p className="text-sm font-bold">Your teaching community</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Practical ideas from educators you follow
                    </p>
                  </div>
                  <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-bold">
                    Feed
                  </span>
                </div>
                <div className="py-5">
                  <div className="flex gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#dce9df] text-sm font-bold text-[#315b43]">
                      AR
                    </div>
                    <div>
                      <p className="text-sm font-bold">Alex Rivera</p>
                      <p className="text-muted-foreground text-xs">
                        Middle school science
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6">
                    I tried a student-led notice-and-wonder routine before our
                    ecosystems unit. The questions were sharper, and quieter
                    students had a clear way into the discussion.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Student voice", "Science", "Discussion"].map((tag) => (
                      <span
                        key={tag}
                        className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-semibold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-muted-foreground grid grid-cols-3 gap-2 border-t pt-4 text-center text-xs font-semibold">
                  <span>Discuss</span>
                  <span>Save</span>
                  <span>Share</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-card scroll-mt-20 border-b">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-accent font-mono text-xs font-semibold tracking-widest uppercase">
                Built around teaching practice
              </p>
              <h2 className="mt-4 font-serif text-4xl sm:text-5xl">
                One place for the work around the lesson.
              </h2>
            </div>
            <div className="bg-border mt-12 grid gap-px overflow-hidden rounded-xl border md:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, description }) => (
                <article key={title} className="bg-card p-6 lg:min-h-64">
                  <Icon aria-hidden="true" className="text-primary size-6" />
                  <h3 className="mt-8 text-base font-bold">{title}</h3>
                  <p className="text-muted-foreground mt-3 text-sm leading-6">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="community" className="scroll-mt-20 border-b">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
              <h2 className="max-w-xl font-serif text-4xl sm:text-5xl">
                Expertise is already in the room. VistaTeacher helps educators
                find it.
              </h2>
              <p className="text-muted-foreground max-w-xl text-base leading-7 lg:justify-self-end">
                Profiles center professional context, discovery respects the way
                teachers search, and private details stay private unless an
                educator explicitly chooses to share them.
              </p>
            </div>
          </div>
        </section>

        <section
          id="pricing"
          className="bg-sidebar text-sidebar-foreground scroll-mt-20"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sidebar-primary font-mono text-xs font-semibold tracking-widest uppercase">
                Free to begin
              </p>
              <h2 className="mt-4 font-serif text-4xl sm:text-5xl">
                Start with the community. Add Plus when the extra tools earn
                their place.
              </h2>
            </div>
            <div className="border-sidebar-border shrink-0 rounded-xl border bg-white/5 p-6">
              <p className="text-sidebar-foreground/70 text-sm">Plus from</p>
              <p className="mt-1 font-serif text-4xl">$9 / month</p>
              <p className="text-sidebar-foreground/70 mt-2 text-sm">
                or $79 billed annually
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-sidebar text-sidebar-foreground/70 border-t px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>VistaTeacher</p>
          <p>Professional community for educators.</p>
        </div>
      </footer>
    </div>
  );
}
