import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  LifeBuoy,
  Scale,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About and policies" };

const destinations = [
  {
    href: "/about",
    icon: Building2,
    title: "About VistaTeacher",
    description: "Our purpose, principles, and approach to educator community.",
  },
  {
    href: "/support",
    icon: LifeBuoy,
    title: "Contact and feedback",
    description: "Ask for help, report a problem, or share product feedback.",
  },
  {
    href: "/settings/billing",
    icon: BadgeDollarSign,
    title: "Plans and billing",
    description: "Compare Community and Plus or manage your membership.",
  },
  {
    href: "/privacy",
    icon: ShieldCheck,
    title: "Privacy policy",
    description: "How VistaTeacher handles account and community data.",
  },
  {
    href: "/terms",
    icon: Scale,
    title: "Terms of service",
    description:
      "The rules and responsibilities that govern use of the service.",
  },
];

export default function InformationPage() {
  return (
    <div>
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
        <header className="max-w-2xl">
          <p className="text-primary font-mono text-[10px] font-bold uppercase">
            VistaTeacher
          </p>
          <h1 className="mt-2 font-serif text-3xl">About & policies</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            Find company information, support, membership details, and the
            policies that apply to your account.
          </p>
        </header>

        <nav aria-label="VistaTeacher information" className="mt-8 border-y">
          {destinations.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 border-b px-1 py-5 last:border-b-0"
            >
              <span className="bg-primary/10 grid size-10 shrink-0 place-items-center rounded-lg">
                <Icon aria-hidden="true" className="text-primary size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="group-hover:text-primary block text-sm font-bold">
                  {title}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs leading-5">
                  {description}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
