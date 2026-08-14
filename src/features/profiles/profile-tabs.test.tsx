import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileTabs } from "@/features/profiles/profile-tabs";

const commonProps = {
  profileBasePath: "/profile" as const,
  profileUid: "educator",
  displayName: "Marlena Kulasinska",
  bio: "A short professional bio.",
  details: [{ label: "School", value: "Vista School" }],
  posts: [],
  resources: [],
  viewer: {
    uid: "viewer",
    displayName: "Viewer",
    photoURL: null,
  },
};

describe("ProfileTabs", () => {
  it("defaults visually to About-first navigation and exposes shareable tab links", () => {
    render(<ProfileTabs {...commonProps} active="about" />);

    expect(
      screen
        .getByRole("navigation", { name: "Profile sections" })
        .querySelectorAll("a"),
    ).toHaveLength(3);
    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.textContent?.trim()),
    ).toEqual(["About", "Resources", "Posts"]);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
      "href",
      "/profile/educator?tab=resources#profile-content",
    );
    expect(
      screen.getByRole("heading", { name: "About Marlena" }),
    ).toBeVisible();
  });

  it("shows an honest empty state when the selected post list is empty", () => {
    render(<ProfileTabs {...commonProps} active="posts" />);

    expect(
      screen.getByText("No posts from Marlena Kulasinska yet"),
    ).toBeVisible();
  });
});
