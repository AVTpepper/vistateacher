import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  GraduationCap,
  Handshake,
  Lightbulb,
  MessageSquare,
  NotebookPen,
  Sparkles,
  UserCheck,
  Users,
  UsersRound,
  UserRoundSearch,
  Globe,
  Save,
} from "lucide-react";
import Link from "next/link";

import {
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing/marketing-shell";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { adminDb } from "@/lib/firebase/admin";

const features = [
  {
    icon: Users,
    title: "Professional network",
    description:
      "Find educators by subject, grade level, school context, and shared professional interests.",
  },
  {
    icon: BookOpen,
    title: "Resource library",
    description:
      "Share practical classroom resources with the context other teachers need to use them well.",
  },
  {
    icon: MessageSquare,
    title: "Forum discussions",
    description:
      "Ask practical questions, exchange experience, and stay connected to ideas that matter.",
  },
  {
    icon: Sparkles,
    title: "AI lesson builder",
    description:
      "Draft, refine, and export lesson plans you can adapt to your learners and classroom goals.",
  },
];

interface HeroParticipant {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

function roundDownRegisteredUsers(count: number): number {
  if (count < 10) return count;

  const digits = Math.floor(Math.log10(count)) + 1;
  const precision = Math.max(0, digits - 2);
  const factor = 10 ** precision;

  return Math.floor(count / factor) * factor;
}

function formatRegisteredUsers(count: number): string {
  return new Intl.NumberFormat("en-US").format(roundDownRegisteredUsers(count));
}

async function getRegisteredUserCount(): Promise<number> {
  const snapshot = await adminDb().collection("users").count().get();

  return snapshot.data().count;
}

async function getHeroParticipants(): Promise<HeroParticipant[]> {
  const snapshot = await adminDb().collection("users").limit(30).get();

  const participants = snapshot.docs
    .map((document) => {
      const data = document.data();
      if (data.status === "suspended" || data.status === "deleted") {
        return null;
      }

      const displayName =
        typeof data.displayName === "string" ? data.displayName.trim() : "";
      if (!displayName) return null;

      return {
        uid: typeof data.uid === "string" ? data.uid : document.id,
        displayName,
        photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      } satisfies HeroParticipant;
    })
    .filter((participant) => participant !== null);

  const withPhotos = participants.filter((participant) => participant.photoURL);
  const withoutPhotos = participants.filter(
    (participant) => !participant.photoURL,
  );

  return [...withPhotos, ...withoutPhotos].slice(0, 5);
}

export async function LandingPage() {
  const [registeredUsers, heroParticipants] = await Promise.all([
    getRegisteredUserCount(),
    getHeroParticipants(),
  ]);
  const registeredUsersLabel = formatRegisteredUsers(registeredUsers);

  return (
    <div className="bg-background min-h-screen overflow-x-clip">
      <MarketingHeader />
      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_42%),radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_36%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
            <div className="surface-glass text-primary mb-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold">
              <Sparkles aria-hidden="true" className="size-3" />
              Built for the work around the lesson
            </div>
            <h1 className="text-foreground font-serif text-5xl leading-[1.08] tracking-tight sm:text-6xl md:text-7xl">
              Find your people
              <br />
              <span className="text-accent italic">in education.</span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl px-2 text-base leading-8 sm:text-lg md:text-xl">
              Build your professional network, exchange practical ideas,
              discover opportunities, and grow your classroom practice
              together.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link href="/sign-up">
                  Create account <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="bg-card/70 hover:bg-card border-border/80 shadow-xs"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
            <div className="text-muted-foreground mt-8 flex items-center justify-center gap-3 text-sm">
              <div className="-space-x-2 flex">
                {heroParticipants.map((participant) => (
                  <UserAvatar
                    key={participant.uid}
                    name={participant.displayName}
                    photoURL={participant.photoURL}
                    className="border-background h-8 w-8 shrink-0 rounded-full border-2 text-[11px] object-cover shadow-sm"
                  />
                ))}
              </div>
              <span>
                Joined by{" "}
                <strong className="text-foreground">
                  {registeredUsersLabel}
                </strong>{" "}
                teachers
              </span>
            </div>
          </div>
          <div className="relative mx-auto max-w-5xl px-4 pb-14 sm:px-6 sm:pb-20">
            <div className="surface-card overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/ivan-aleksic-PDRFeeDniCk-unsplash.jpg"
                alt="A bright, active classroom"
                className="h-52 w-full object-cover sm:h-72 md:h-80"
              />
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-primary py-12 text-primary-foreground sm:py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_42%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,white_12%,transparent),transparent_36%)]"
          />
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-8 text-center sm:mb-10">
              <p className="text-xs font-bold tracking-[0.16em] text-white/70 uppercase">
                Your educator journey
              </p>
              <h2 className="mt-2 font-serif text-3xl tracking-tight text-white sm:text-4xl">
                From first connection to classroom impact
              </h2>
            </div>
            <div className="journey-timeline relative">
              <div
                aria-hidden="true"
                className="journey-timeline-track hidden lg:block"
              />
              <ol className="grid list-none grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-4">
                {[
                  {
                    step: "01",
                    label: "Find your peers",
                    detail:
                      "Discover educators by subject, grade, and school context.",
                    icon: UsersRound,
                  },
                  {
                    step: "02",
                    label: "Share useful resources",
                    detail:
                      "Publish classroom-ready materials with the context others need.",
                    icon: BookOpen,
                  },
                  {
                    step: "03",
                    label: "Discuss real challenges",
                    detail:
                      "Trade practical advice in focused forum conversations.",
                    icon: MessageSquare,
                  },
                  {
                    step: "04",
                    label: "Grow together",
                    detail:
                      "Build lessons, refine practice, and keep momentum with your network.",
                    icon: Sparkles,
                  },
                ].map(({ step, label, detail, icon: Icon }) => (
                  <li
                    key={step}
                    className="journey-step relative flex flex-col items-center text-center"
                  >
                    <span className="journey-step-node bg-accent text-accent-foreground relative z-10 mb-4 grid size-14 place-items-center rounded-2xl">
                      <Icon aria-hidden="true" className="size-6" />
                    </span>
                    <p className="mb-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.14em] text-white">
                      {step}
                    </p>
                    <p className="font-serif text-xl text-white sm:text-2xl">
                      {label}
                    </p>
                    <p className="mt-2 max-w-[16rem] text-sm leading-6 text-white/80">
                      {detail}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-16">
              <p className="text-accent text-xs font-bold tracking-[0.14em] uppercase">
                Professional toolkit
              </p>
              <h2 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">
                Everything teachers need
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-base sm:text-lg">
                One focused platform to connect with peers, share practice, and
                keep your educator network active.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              {features.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="surface-card surface-card-interactive group p-6 sm:p-7"
                >
                  <span className="icon-well-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-12 place-items-center rounded-2xl transition-colors duration-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="group-hover:text-primary mt-5 font-serif text-xl tracking-tight transition-colors duration-200">
                    {title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-20 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-16">
              <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">
                How VistaTeacher works
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-base sm:text-lg">
                Discover people, build trusted relationships, and collaborate with purpose.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
              <article className="surface-card surface-card-interactive group p-6 sm:p-7">
                <span className="icon-well-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-12 place-items-center rounded-2xl transition-colors duration-200">
                  <Compass aria-hidden="true" className="size-5" />
                </span>
                <h3 className="group-hover:text-primary mt-5 font-serif text-xl tracking-tight transition-colors duration-200">
                  Discover
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
                  Filter by subject, grade, and role to find educators who match your teaching context.
                </p>
              </article>
              <article className="surface-card surface-card-interactive group p-6 sm:p-7">
                <span className="icon-well-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-12 place-items-center rounded-2xl transition-colors duration-200">
                  <Users aria-hidden="true" className="size-5" />
                </span>
                <h3 className="group-hover:text-primary mt-5 font-serif text-xl tracking-tight transition-colors duration-200">
                  Connect
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
                  Follow peers, explore their work, and build a network that supports your goals.
                </p>
              </article>
              <article className="surface-card surface-card-interactive group p-6 sm:p-7">
                <span className="icon-well-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-12 place-items-center rounded-2xl transition-colors duration-200">
                  <Handshake aria-hidden="true" className="size-5" />
                </span>
                <h3 className="group-hover:text-primary mt-5 font-serif text-xl tracking-tight transition-colors duration-200">
                  Collaborate
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
                  Turn connections into practical outcomes through forum posts, resources, and shared ideas.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          id="connect-with"
          className="bg-muted/45 scroll-mt-20 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-16">
              <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">
                Who are you looking to connect with?
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-base sm:text-lg">
                Start with your intent. Then create your profile to unlock full educator discovery.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Teachers in your subject",
                  description: "Swap ideas with people teaching the same content and classroom realities.",
                  icon: UserRoundSearch,
                },
                {
                  title: "International educators",
                  description: "Compare approaches from different school systems and teaching cultures.",
                  icon: Globe,
                },
                {
                  title: "Collaborators",
                  description: "Find partners for planning, projects, and long-term professional growth.",
                  icon: Handshake,
                },
                {
                  title: "Mentors",
                  description: "Learn from experienced educators who can support your next career step.",
                  icon: UserCheck,
                },
                {
                  title: "Education professionals",
                  description: "Connect beyond classroom roles across curriculum, leadership, and support teams.",
                  icon: Users,
                },
              ].map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="surface-card surface-card-interactive group p-6 sm:p-7"
                >
                  <span className="icon-well-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-12 place-items-center rounded-2xl transition-colors duration-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="group-hover:text-primary mt-5 font-serif text-lg tracking-tight transition-colors duration-200">
                    {title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="tools"
          className="scroll-mt-20 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-16">
              <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">
                Tools that strengthen your educator network
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-base sm:text-lg">
                Keep your people connections active with resources, planning support, and community engagement.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Forum",
                  description: "Join forum posts about shared challenges and practical ideas with educators.",
                  icon: Users,
                },
                {
                  title: "Resources",
                  description: "Discover and share teaching materials that save planning time.",
                  icon: BookOpen,
                },
                {
                  title: "Lesson Builder",
                  description: "Create and refine lesson plans with structured workflows.",
                  icon: NotebookPen,
                },
              ].map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="surface-card surface-card-interactive group p-6 sm:p-7"
                >
                  <span className="icon-well-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-12 place-items-center rounded-2xl transition-colors duration-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="group-hover:text-primary mt-5 font-serif text-xl tracking-tight transition-colors duration-200">
                    {title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="community"
          className="bg-muted/45 scroll-mt-20 py-16 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <span className="icon-well size-12 rounded-2xl">
                <GraduationCap aria-hidden="true" />
              </span>
              <h2 className="mt-5 font-serif text-4xl tracking-tight sm:text-5xl">
                Teaching expertise belongs in conversation.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Professional profiles give ideas useful context.",
                "Discovery centers grade, subject, school, and place.",
                "Private contact information stays opt-in.",
                "Community tools share one consistent workspace.",
              ].map((item) => (
                <div
                  className="surface-card surface-card-interactive p-5"
                  key={item}
                >
                  <span className="bg-success/12 text-success grid size-9 place-items-center rounded-xl">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                  <p className="mt-3 text-sm leading-6 font-semibold">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="font-serif text-4xl sm:text-5xl">
                Simple, honest pricing
              </h2>
              <p className="text-muted-foreground mt-3">
                Start with the community. Add Plus when the extra tools earn
                their place.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Plan
                name="Community"
                price="$0"
                detail="For joining the educator community"
                features={[
                  "Professional educator profile",
                  "Community discovery",
                  "5 resource downloads each month",
                  "1 AI lesson with 2 refinements",
                ]}
              />
              <Plan
                name="Plus"
                price="$9"
                detail="Per month, or $79 yearly"
                featured
                features={[
                  "Expanded connections and messaging",
                  "50 AI generations each month",
                  "Unlimited resource uploads and downloads",
                  "Unlimited exports and full analytics",
                ]}
              />
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-primary py-16 text-primary-foreground sm:py-24">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <GraduationCap
              aria-hidden="true"
              className="mx-auto mb-6 size-12 opacity-80"
            />
            <h2 className="mb-4 font-serif text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Ready to find your people?
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
              Join {registeredUsersLabel} registered teachers already
              connecting, sharing resources, and building stronger classrooms
              together.
            </p>
            <Button asChild size="lg" variant="accent">
              <Link href="/sign-up">
                Create your free account <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Plan({
  name,
  price,
  detail,
  features,
  featured = false,
}: {
  name: string;
  price: string;
  detail: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <article
      className={
        featured
          ? "surface-card-featured relative overflow-hidden p-8"
          : "surface-card surface-card-interactive p-8"
      }
    >
      {featured && (
        <span className="bg-accent absolute top-4 right-4 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm">
          Most popular
        </span>
      )}
      <h3 className="font-serif text-2xl tracking-tight">{name}</h3>
      <p
        className={
          featured
            ? "mt-1 text-sm text-white/70"
            : "text-muted-foreground mt-1 text-sm"
        }
      >
        {detail}
      </p>
      <p className="mt-5 text-4xl font-bold">
        {price}
        <span
          className={
            featured
              ? "text-base font-normal text-white/70"
              : "text-muted-foreground text-base font-normal"
          }
        >
          {" "}
          / month
        </span>
      </p>
      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li className="flex items-center gap-3 text-sm" key={feature}>
            <Check
              aria-hidden="true"
              className={
                featured ? "text-sidebar-primary size-4" : "text-accent size-4"
              }
            />
            {feature}
          </li>
        ))}
      </ul>
      <Button
        asChild
        className="mt-8 w-full"
        variant={featured ? "accent" : "outline"}
      >
        <Link href="/sign-up">Create account</Link>
      </Button>
    </article>
  );
}
