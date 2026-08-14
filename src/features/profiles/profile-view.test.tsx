import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfileView } from "@/features/profiles/profile-view";
import type { ProfileView as ProfileViewData } from "@/lib/profiles/server";

vi.mock("@/features/network/follow-button", () => ({
  FollowButton: () => <button type="button">Request sent</button>,
}));

vi.mock("@/features/profiles/profile-tabs", () => ({
  ProfileTabs: () => <div data-testid="profile-tabs" />,
}));

const profile = {
  uid: "educator",
  displayName: "Marlena Kulasinska",
  professionalRoles: ["School leader"],
  gradeLevel: "College / University",
  subjects: ["Arts"],
  languages: ["English"],
  country: "Denmark",
  city: "Copenhagen",
  school: "Vista School",
  yearsOfExperience: 12,
  bio: "A short professional bio.",
  website: null,
  interests: ["Leadership"],
  photoURL: null,
  coverImageURL: null,
  coverTheme: "warm-sunset" as const,
  role: "educator" as const,
  isVerified: false,
  connectionCount: 1,
  resourceCount: 99,
  postCount: 99,
  status: "active" as const,
  createdAt: null,
  updatedAt: null,
};

function data(
  connectionStatus: ProfileViewData["connectionStatus"],
): ProfileViewData {
  return {
    profile,
    joinedLabel: "August 2026",
    plan: "free",
    contactDetails: null,
    isOwner: false,
    connectionStatus,
    connectionDirection: connectionStatus === "pending" ? "outgoing" : null,
    canViewOnlineStatus: false,
    isOnline: false,
  };
}

const commonProps = {
  activeTab: "about" as const,
  postCount: 5,
  posts: [],
  resourceCount: 2,
  resources: [],
  viewer: {
    uid: "viewer",
    displayName: "Viewer",
    photoURL: null,
  },
};

describe("ProfileView", () => {
  it("uses visible content counts, links every stat, and disables messaging while disconnected", () => {
    render(<ProfileView {...commonProps} data={data("pending")} />);

    expect(
      screen.getByRole("link", {
        name: "View Marlena Kulasinska's connections",
      }),
    ).toHaveAttribute(
      "href",
      "/network?view=connections&uid=educator&scope=shared",
    );
    expect(
      screen.getByRole("link", {
        name: "View Marlena Kulasinska's resources",
      }),
    ).toHaveTextContent(/2\s*Resources/);
    expect(
      screen.getByRole("link", {
        name: "View Marlena Kulasinska's posts",
      }),
    ).toHaveTextContent(/5\s*Posts/);

    const message = screen.getByRole("button", { name: "Message" });
    expect(message).toBeDisabled();
    expect(message).toHaveAttribute(
      "title",
      "Connect with Marlena Kulasinska to send a message.",
    );
  });

  it("enables the message link once the relationship is accepted", () => {
    render(<ProfileView {...commonProps} data={data("accepted")} />);

    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute(
      "href",
      "/messages?compose=educator",
    );
  });
});
