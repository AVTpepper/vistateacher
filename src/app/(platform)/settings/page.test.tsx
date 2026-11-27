import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "./page";
import {
  PrivateRecoveryError,
  newPrivateUserData,
} from "@/lib/profiles/private-user";

const state = vi.hoisted(() => ({ getPrivate: vi.fn(), form: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCurrentAccount: async () => ({
    uid: "owner",
    email: "login@example.com",
  }),
}));
vi.mock("@/lib/billing/server", () => ({ getBillingState: async () => null }));
vi.mock("@/lib/profiles/server", () => ({ getPrivateUser: state.getPrivate }));
vi.mock("@/features/profiles/privacy-settings-form", () => ({
  PrivacySettingsForm: (props: unknown) => {
    state.form(props);
    return <form aria-label="Editable privacy settings" />;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.getPrivate.mockResolvedValue({
    state: "ready",
    user: newPrivateUserData("login@example.com", null),
    repaired: false,
  });
});

it("keeps recovered, valid settings editable", async () => {
  render(await SettingsPage());
  expect(
    screen.getByRole("form", { name: "Editable privacy settings" }),
  ).toBeVisible();
  expect(state.form).toHaveBeenCalledWith(
    expect.objectContaining({ deletionRequested: false }),
  );
});

it("shows an owner-only recovery notice with support and billing access instead of invented editable settings", async () => {
  state.getPrivate.mockResolvedValue({ state: "recovery-required" });
  render(await SettingsPage());
  expect(screen.getByRole("status")).toHaveTextContent(
    "Your contact details remain hidden",
  );
  expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute(
    "href",
    "/support",
  );
  expect(
    screen.getByRole("link", { name: "Billing settings" }),
  ).toHaveAttribute("href", "/settings/billing");
  expect(state.form).not.toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("keeps deletion-blocked settings read-only", async () => {
  state.getPrivate.mockRejectedValue(
    new PrivateRecoveryError("deletion-blocked"),
  );
  render(await SettingsPage());
  expect(screen.getByRole("status")).toHaveTextContent(
    "account deletion needs review",
  );
  expect(state.form).not.toHaveBeenCalled();
});

it("returns a genuinely missing public profile to onboarding", async () => {
  state.getPrivate.mockRejectedValue(
    new PrivateRecoveryError("profile-required"),
  );
  await expect(SettingsPage()).rejects.toThrow("REDIRECT:/onboarding");
});

it("leaves unexpected failures available to the normal retry boundary", async () => {
  state.getPrivate.mockRejectedValue(new Error("Database unavailable"));
  await expect(SettingsPage()).rejects.toThrow("Database unavailable");
});
