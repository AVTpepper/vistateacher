"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function MarketingFlow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.flowVisible = "true";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 },
    );
    root.current
      .querySelectorAll("section")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={root} className={`marketing-flow ${className}`}>
      {children}
    </div>
  );
}
