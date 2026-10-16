"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";
import { useId, useRef, useState } from "react";

export interface StoryCard {
  title: string;
  description: string;
  eyebrow: string;
  tags: string[];
  icon: "people" | "book" | "chat" | "sparkles";
}

const icons = {
  people: Users,
  book: BookOpen,
  chat: MessagesSquare,
  sparkles: Sparkles,
};

export function StoryCarousel({
  label,
  cards,
}: {
  label: string;
  cards: StoryCard[];
}) {
  const id = useId();
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  function goTo(index: number) {
    const list = track.current;
    const card = list?.children[index] as HTMLElement | undefined;
    if (!list || !card) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    list.scrollTo({
      left: card.offsetLeft - (list.children[0] as HTMLElement).offsetLeft,
      behavior: reduced ? "instant" : "smooth",
    });
  }

  function syncActive() {
    const list = track.current;
    if (!list) return;
    if (list.scrollWidth - list.clientWidth - list.scrollLeft < 2) {
      setActive(cards.length - 1);
      return;
    }
    const start = (list.children[0] as HTMLElement).offsetLeft;
    let nearest = 0;
    let distance = Infinity;
    Array.from(list.children).forEach((child, index) => {
      const nextDistance = Math.abs(
        (child as HTMLElement).offsetLeft - start - list.scrollLeft,
      );
      if (nextDistance < distance) {
        nearest = index;
        distance = nextDistance;
      }
    });
    setActive(nearest);
  }

  return (
    <div
      className="story-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          A few possibilities. Find your starting point.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={`Previous card in ${label}`}
            aria-controls={id}
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
            className="story-arrow"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label={`Next card in ${label}`}
            aria-controls={id}
            disabled={active === cards.length - 1}
            onClick={() => goTo(active + 1)}
            className="story-arrow"
          >
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      <ul
        id={id}
        ref={track}
        className="story-track"
        tabIndex={0}
        onScroll={syncActive}
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
          return (
            <li
              key={card.title}
              className="story-slide"
              data-active={active === index}
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
              </article>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" aria-label={`Choose a card in ${label}`}>
          {cards.map((card, index) => (
            <button
              key={card.title}
              type="button"
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
    </div>
  );
}
