import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingForm } from "./onboarding-form";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

async function fillEssentials() {
  fireEvent.click(screen.getByLabelText("Classroom teacher"));
  fireEvent.change(screen.getByLabelText("Education stage"), {
    target: { value: "Primary / Elementary School" },
  });
  fireEvent.click(screen.getByLabelText("Science"));
  fireEvent.click(screen.getByRole("button", { name: "Get started" }));
}

describe("short onboarding", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("completes with essential details and preserves a return destination", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ next: "/dashboard" }),
      });
    vi.stubGlobal("fetch", fetch);
    render(
      <OnboardingForm displayName="Ada Teacher" returnTo="/post/classroom" />,
    );
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
    await fillEssentials();
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith("/post/classroom"),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      country: "",
      city: "",
      subjects: ["Science"],
    });
  });

  it("keeps selections after a failed save and preserves the chosen paid plan", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ next: "/dashboard" }),
      });
    vi.stubGlobal("fetch", fetch);
    render(
      <OnboardingForm
        displayName="Ada Teacher"
        planIntent={{ plan: "plus", interval: "year" }}
      />,
    );
    await fillEssentials();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Science")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/settings/billing?plan=plus&interval=year",
      ),
    );
  });
});
