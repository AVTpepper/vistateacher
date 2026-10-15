import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClient: () => ({ auth: {} }),
}));

describe("authentication field accessibility", () => {
  it("associates validation errors with email and password inputs", async () => {
    render(<AuthForm mode="sign-in" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const email = screen.getByLabelText("Email address");
    const password = screen.getByLabelText("Password", { exact: true });
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription("Enter a valid email address.");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Enter your password.");
  });

  it("keeps password guidance associated when the password is revealed", () => {
    render(<AuthForm mode="sign-up" />);
    const password = screen.getByLabelText("Password", { exact: true });
    fireEvent.focus(password);
    expect(password).toHaveAccessibleDescription(/Use at least 10 characters/);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
