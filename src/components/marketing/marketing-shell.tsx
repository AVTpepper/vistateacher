"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function MarketingHeader({ signedIn = false }: { signedIn?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !controlsRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <header className="bg-background/95 sticky top-0 z-50 border-b">
      <nav
        aria-label="Main navigation"
        className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8"
      >
        <Link
          href="/"
          prefetch={false}
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
        <div ref={controlsRef} className="flex items-center gap-2">
          {signedIn ? (
            <Button
              asChild
              className="hidden min-[420px]:inline-flex"
              size="sm"
            >
              <Link href="/app">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="hidden sm:inline-flex"
                size="sm"
                variant="ghost"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button
                asChild
                className="hidden min-[420px]:inline-flex"
                size="sm"
              >
                <Link href="/sign-up">Create account</Link>
              </Button>
            </>
          )}
          <Button
            type="button"
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close main menu" : "Open main menu"}
            className="md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            size="icon"
            variant="ghost"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
        <button
          type="button"
          aria-label="Close navigation overlay"
          className={
            menuOpen
              ? "fixed inset-x-0 top-16 bottom-0 z-40 bg-black/45 md:hidden"
              : "hidden"
          }
          onClick={() => setMenuOpen(false)}
          tabIndex={-1}
        />
        <div
          ref={menuRef}
          id="mobile-navigation"
          aria-hidden={!menuOpen}
          className={
            "bg-background fixed top-16 right-0 z-50 grid max-h-[calc(100dvh-4rem)] w-[calc(100vw-3rem)] max-w-80 content-start gap-1 overflow-y-auto rounded-bl-lg border-b border-l p-4 shadow-xl transition-transform duration-200 ease-out md:hidden " +
            (menuOpen
              ? "translate-x-0"
              : "pointer-events-none translate-x-full")
          }
        >
          <Link
            className="hover:bg-muted rounded-md px-3 py-2.5 text-sm font-semibold"
            href="/about"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
          >
            About
          </Link>
          <Link
            className="hover:bg-muted rounded-md px-3 py-2.5 text-sm font-semibold"
            href="/pricing"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
          >
            Pricing
          </Link>
          <Link
            className="hover:bg-muted rounded-md px-3 py-2.5 text-sm font-semibold"
            href="/help"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
          >
            Help
          </Link>
          {signedIn ? (
            <Button
              asChild
              className="mt-2 w-full min-[420px]:hidden"
              size="sm"
            >
              <Link
                href="/app"
                onClick={() => setMenuOpen(false)}
                tabIndex={menuOpen ? 0 : -1}
              >
                Dashboard
              </Link>
            </Button>
          ) : (
            <>
              <Link
                className="hover:bg-muted rounded-md px-3 py-2.5 text-sm font-semibold sm:hidden"
                href="/sign-in"
                onClick={() => setMenuOpen(false)}
                tabIndex={menuOpen ? 0 : -1}
              >
                Sign in
              </Link>
              <Button
                asChild
                className="mt-2 w-full min-[420px]:hidden"
                size="sm"
              >
                <Link
                  href="/sign-up"
                  onClick={() => setMenuOpen(false)}
                  tabIndex={menuOpen ? 0 : -1}
                >
                  Create account
                </Link>
              </Button>
            </>
          )}
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
