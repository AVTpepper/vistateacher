import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ForumExperience } from "@/features/forum/forum-experience";
import type { ForumCategory } from "@/lib/forum/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

const category: ForumCategory = {
  id: "inspiration-and-ideas",
  name: "Inspiration and Ideas",
  description: "Share inspiration with other educators.",
  icon: "Lightbulb",
  color: "#D85F56",
  threadCount: 2,
  commentCount: 8,
  lastActivityAt: "2026-08-16T08:00:00.000Z",
};

describe("ForumExperience categories", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows separate thread and comment totals with latest activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T10:00:00.000Z"));

    const { container } = render(
      <ForumExperience
        categories={[category]}
        initialPage={{ threads: [], nextCursor: null }}
        selectedCategory={null}
        showThreads={false}
      />,
    );

    expect(screen.getByText("2 threads")).toBeInTheDocument();
    expect(screen.getByText("8 comments")).toBeInTheDocument();
    expect(screen.queryByText(/posts$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("Last activity about 2 hours ago"),
    ).toBeInTheDocument();
    expect(container.querySelector(".lucide-list-tree")).toBeInTheDocument();
    expect(
      container.querySelector(".lucide-message-circle"),
    ).toBeInTheDocument();
  });
});
