import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubscriptionManager } from "./subscription-manager";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("subscription cancellation", () => {
  it("explains what remains free and lets members keep renewal without a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <SubscriptionManager
        canManageBilling
        cancelAtPeriodEnd={false}
        periodEndLabel="November 16, 2026"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel at period end" }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Turn off Plus renewal?",
    });
    expect(dialog).toHaveTextContent("through November 16, 2026");
    expect(dialog).toHaveTextContent(
      "Connections, messaging, and standard exports stay free.",
    );
    expect(dialog).toHaveTextContent(
      "AI allowance returns to 3 actions per month",
    );
    await user.click(within(dialog).getByRole("button", { name: "Keep Plus" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
