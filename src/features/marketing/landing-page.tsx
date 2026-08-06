import {
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  MessageSquare,
  Sparkles,
  Users,
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
            className="from-primary/5 to-accent/5 pointer-events-none absolute inset-0 bg-linear-to-br via-transparent"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
            <div className="bg-primary/14 text-primary mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold">
              <Sparkles aria-hidden="true" className="size-3" />
              Built for the work around the lesson
            </div>
            <h1 className="text-foreground font-serif text-5xl leading-[1.08] sm:text-6xl md:text-7xl">
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
                className="border-accent/45 hover:bg-accent/8"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <div className="-space-x-2 flex">
                {heroParticipants.map((participant) => (
                  <UserAvatar
                    key={participant.uid}
                    name={participant.displayName}
                    photoURL={participant.photoURL}
                    className="border-background h-8 w-8 shrink-0 rounded-full border-2 text-[11px] object-cover"
                  />
                ))}
              </div>
              <span>
                Joined by <strong className="text-foreground">{registeredUsersLabel}</strong> teachers
              </span>
            </div>
          </div>
          <div className="relative mx-auto max-w-5xl px-4 pb-14 sm:px-6 sm:pb-20">
            <div className="bg-card shadow-foreground/5 overflow-hidden rounded-2xl border shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/ivan-aleksic-PDRFeeDniCk-unsplash.jpg"
                alt="A bright, active classroom"
                className="h-52 w-full object-cover sm:h-72 md:h-80"
              />
            </div>
          </div>
        </section>

        <section className="bg-primary py-10 text-primary-foreground sm:py-14">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 text-center md:grid-cols-4">
            {[
              "Find your peers",
              "Share useful resources",
              "Discuss real challenges",
              "Grow together",
            ].map((label, index) => (
              <div key={label}>
                <p className="font-serif text-3xl sm:text-4xl">0{index + 1}</p>
                <p className="mt-1 text-sm text-white/70">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-16">
              <p className="text-accent text-xs font-bold tracking-wide uppercase">
                Professional toolkit
              </p>
              <h2 className="font-serif text-4xl sm:text-5xl">
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
                  className="bg-card border-accent/30 hover:border-accent/55 hover:shadow-foreground/10 hover:-translate-y-1 group rounded-2xl border p-6 transition-all duration-200 sm:p-7"
                >
                  <span className="bg-accent/12 text-accent group-hover:bg-accent group-hover:text-accent-foreground grid size-11 place-items-center rounded-xl transition-colors duration-200">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-4 font-serif text-xl group-hover:text-primary transition-colors duration-200">
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
          className="bg-muted/40 scroll-mt-20 py-16 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <span className="bg-secondary text-primary grid size-12 place-items-center rounded-xl">
                <GraduationCap aria-hidden="true" />
              </span>
              <h2 className="mt-5 font-serif text-4xl sm:text-5xl">
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
                <div className="bg-card rounded-xl border p-5" key={item}>
                  <Check aria-hidden="true" className="text-success size-5" />
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

        <section className="bg-linear-to-br from-primary via-primary to-accent py-16 text-white sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <GraduationCap aria-hidden="true" className="mx-auto mb-6 size-12 opacity-80" />
            <h2 className="mb-4 font-serif text-3xl sm:text-4xl md:text-5xl">
              Ready to find your people?
            </h2>
            <p className="mb-2 text-base leading-relaxed text-white/80 sm:text-lg">
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
          ? "bg-primary text-primary-foreground relative overflow-hidden rounded-2xl p-8"
          : "bg-card rounded-2xl border p-8"
      }
    >
      {featured && (
        <span className="bg-accent absolute top-4 right-4 rounded-full px-2.5 py-1 text-xs font-bold text-white">
          Most popular
        </span>
      )}
      <h3 className="font-serif text-2xl">{name}</h3>
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
