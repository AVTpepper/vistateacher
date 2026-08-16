import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalSearch } from "@/features/search/global-search";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("GlobalSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
  });

  it("shows forum discussions and navigates directly to the thread", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          educators: [],
          resources: [],
          discussions: [
            {
              id: "test-discussion",
              title: "A test discussion",
              categoryId: "general-discussion",
            },
          ],
        }),
      }),
    );

    render(<GlobalSearch enableShortcut={false} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /search teachers, resources, forums/i,
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search VistaTeacher" }),
      {
        target: { value: "a test discussion" },
      },
    );

    expect(
      await screen.findByRole("heading", { name: "Forum discussions" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /a test discussion/i }));
    expect(push).toHaveBeenCalledWith("/forum/test-discussion");
  });
});
