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

const features = [
  {
    icon: Users,
    title: "Professional network",
    description:
      "Find educators by grade, subject, school, location, and shared professional interests.",
  },
  {
    icon: BookOpen,
    title: "Resource library",
    description:
      "Share classroom-ready materials with the context other educators need to use them well.",
  },
  {
    icon: MessageSquare,
    title: "Forum discussions",
    description:
      "Ask practical questions and exchange experience across focused teaching communities.",
  },
  {
    icon: Sparkles,
    title: "AI lesson builder",
    description:
      "Draft structured lesson plans, refine them for your learners, and export classroom-ready files.",
  },
];

export function LandingPage() {
  return (
    <div className="bg-background min-h-screen overflow-x-clip">
      <MarketingHeader />
      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="from-primary/5 to-accent/5 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
            <div className="bg-accent/10 text-accent mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold">
              <Sparkles aria-hidden="true" className="size-3" />
              Built for the work around the lesson
            </div>
            <h1 className="text-foreground font-serif text-5xl leading-[1.08] sm:text-6xl md:text-7xl">
              The network built
              <br />
              <span className="text-primary italic">for teachers.</span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl px-2 text-base leading-8 sm:text-lg md:text-xl">
              Connect with educators. Share practical resources. Grow your
              practice. Build stronger classroom experiences together.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Create account <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
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

        <section className="bg-primary text-primary-foreground py-10 sm:py-14">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 text-center md:grid-cols-4">
            {[
              "Find your peers",
              "Share your practice",
              "Discuss real challenges",
              "Plan with support",
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
              <h2 className="font-serif text-4xl sm:text-5xl">
                Everything teachers need
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-base sm:text-lg">
                One focused platform for the professional work educators do
                together.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              {features.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="bg-card hover:border-primary/30 rounded-2xl border p-6 transition-colors sm:p-7"
                >
                  <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-4 font-serif text-xl">{title}</h3>
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
                  "Resource and forum access",
                  "Basic messaging limits",
                ]}
              />
              <Plan
                name="Plus"
                price="$9"
                detail="Per month, or $79 yearly"
                featured
                features={[
                  "Expanded connections and messaging",
                  "AI lesson builder quota",
                  "Unlimited resource uploads",
                  "Exports and full analytics",
                ]}
              />
            </div>
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
                featured ? "text-sidebar-primary size-4" : "text-primary size-4"
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
