import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileTabs } from "@/features/profiles/profile-tabs";
import { ProfileTabProvider } from "@/features/profiles/profile-tab-context";

const commonProps = {
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

function renderTabs(active: "about" | "resources" | "posts") {
  window.history.replaceState(null, "", `/profile/educator?tab=${active}`);
  return render(
    <ProfileTabProvider initialTab={active}>
      <ProfileTabs {...commonProps} />
    </ProfileTabProvider>,
  );
}

describe("ProfileTabs", () => {
  it("defaults visually to About-first navigation and exposes shareable tab links", () => {
    renderTabs("about");

    expect(
      screen
        .getByRole("navigation", { name: "Profile sections" })
        .querySelectorAll("button"),
    ).toHaveLength(3);
    expect(
      screen.getAllByRole("button").map((link) => link.textContent?.trim()),
    ).toEqual(["About", "Resources", "Posts"]);
    expect(screen.getByRole("button", { name: "About" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("heading", { name: "About Marlena" }),
    ).toBeVisible();
  });

  it("shows the profile post list in place without navigating to the feed", () => {
    renderTabs("about");

    fireEvent.click(screen.getByRole("button", { name: "Posts" }));

    expect(
      screen.getByText("No posts from Marlena Kulasinska yet"),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/profile/educator");
    expect(window.location.search).toBe("?tab=posts");
    expect(window.location.hash).toBe("#profile-content");
  });
});
