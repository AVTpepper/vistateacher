"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

export interface StoryCard {
  title: string;
  description: string;
  eyebrow: string;
  tags: string[];
  icon: "people" | "book" | "chat" | "sparkles";
  href?: string;
  linkLabel?: string;
}

const icons = {
  people: Users,
  book: BookOpen,
  chat: MessagesSquare,
  sparkles: Sparkles,
};

// Keep a readable list in server HTML; enhance to a deck after hydration.
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function StoryCarousel({
  label,
  cards,
}: {
  label: string;
  cards: StoryCard[];
}) {
  const id = useId();
  const enhanced = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const [active, setActive] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function goTo(index: number) {
    setActive(Math.max(0, Math.min(cards.length - 1, index)));
  }

  if (!cards.length) return null;

  return (
    <div
      className="story-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="story-controls mb-5 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          A few possibilities. Find your starting point.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={`Previous card in ${label}`}
            aria-controls={id}
            disabled={!enhanced || active === 0}
            onClick={() => goTo(active - 1)}
            className="story-arrow"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label={`Next card in ${label}`}
            aria-controls={id}
            disabled={!enhanced || active === cards.length - 1}
            onClick={() => goTo(active + 1)}
            className="story-arrow"
          >
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      <ul
        id={id}
        className="story-track"
        tabIndex={enhanced ? 0 : undefined}
        data-enhanced={enhanced}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" || !event.isPrimary) return;
          touchStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
        onPointerUp={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            goTo(active + (dx < 0 ? 1 : -1));
          }
        }}
        aria-label={`${label} cards`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next =
            event.key === "ArrowRight"
              ? Math.min(cards.length - 1, active + 1)
              : event.key === "ArrowLeft"
                ? Math.max(0, active - 1)
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? cards.length - 1
                    : null;
          if (next === null) return;
          event.preventDefault();
          goTo(next);
        }}
      >
        {cards.map((card, index) => {
          const Icon = icons[card.icon];
          const depth = (index - active + cards.length) % cards.length;
          return (
            <li
              key={card.title}
              className="story-slide"
              data-active={active === index}
              aria-hidden={enhanced && active !== index ? true : undefined}
              inert={enhanced && active !== index}
              style={
                {
                  "--card-depth": Math.min(depth, 3),
                  zIndex: cards.length - depth,
                } as CSSProperties
              }
            >
              <article
                className="story-card"
                aria-labelledby={`${id}-title-${index}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="story-icon">
                    <Icon aria-hidden="true" className="size-7" />
                  </span>
                  <span className="story-number" aria-hidden="true">
                    0{index + 1}
                  </span>
                </div>
                <p className="text-primary mt-7 text-xs font-bold tracking-widest uppercase">
                  {card.eyebrow}
                </p>
                <h3
                  id={`${id}-title-${index}`}
                  className="mt-3 font-serif text-3xl tracking-tight"
                >
                  {card.title}
                </h3>
                <p className="text-muted-foreground mt-4 max-w-md text-base leading-7">
                  {card.description}
                </p>
                <ul
                  className="mt-auto flex flex-wrap gap-2 pt-7"
                  aria-label={`${card.title} highlights`}
                >
                  {card.tags.map((tag) => (
                    <li key={tag} className="story-tag">
                      {tag}
                    </li>
                  ))}
                </ul>
                {card.href && card.linkLabel && (
                  <Link href={card.href} className="story-action mt-5">
                    {card.linkLabel}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                )}
              </article>
            </li>
          );
        })}
      </ul>
      <div className="story-controls mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" aria-label={`Choose a card in ${label}`}>
          {cards.map((card, index) => (
            <button
              key={card.title}
              type="button"
              disabled={!enhanced}
              aria-label={`Show ${card.title}`}
              aria-current={active === index ? "true" : undefined}
              aria-controls={id}
              onClick={() => goTo(index)}
              className="story-dot"
            >
              <span />
            </button>
          ))}
        </div>
        <p
          className="text-muted-foreground text-xs"
          aria-live="polite"
          aria-atomic="true"
        >
          {active + 1} of {cards.length} · {cards[active].title}
        </p>
      </div>
      <noscript>
        <style>{`
        .story-carousel .story-controls { display: none !important; }
        .story-carousel .story-track { width: 100%; max-width: none; margin: 0; perspective: none; transform-style: flat; }
        .story-carousel .story-slide { grid-area: auto !important; transform: none !important; pointer-events: auto !important; }
        .story-carousel .story-slide .story-card > * { visibility: visible !important; }
      `}</style>
      </noscript>
    </div>
  );
}
