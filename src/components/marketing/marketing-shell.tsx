import Link from "next/link";

import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="bg-background/95 sticky top-0 z-50 border-b backdrop-blur-md">
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
            className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-md font-sans text-sm font-bold"
          >
            VT
          </span>
          VistaTeacher
        </Link>
        <div className="hidden items-center gap-7 text-sm font-semibold md:flex">
          <Link className="hover:text-primary" href="/about">
            About
          </Link>
          <Link className="hover:text-primary" href="/pricing">
            Pricing
          </Link>
          <Link className="hover:text-primary" href="/help">
            Help
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            className="hidden sm:inline-flex"
            size="sm"
            variant="ghost"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Join free</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-sidebar text-sidebar-foreground/75 border-t px-5 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sidebar-foreground font-serif text-lg">
            VistaTeacher
          </p>
          <p className="mt-1">Professional community for educators.</p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          <Link className="hover:text-sidebar-foreground" href="/about">
            About
          </Link>
          <Link className="hover:text-sidebar-foreground" href="/pricing">
            Pricing
          </Link>
          <Link className="hover:text-sidebar-foreground" href="/help">
            Help
          </Link>
          <Link className="hover:text-sidebar-foreground" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-sidebar-foreground" href="/terms">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
