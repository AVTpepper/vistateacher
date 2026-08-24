import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiscoverFilters } from "@/features/network/discover-filters";

describe("DiscoverFilters", () => {
  it("offers countries in the location filter and preserves its selection", () => {
    render(
      <DiscoverFilters
        values={{
          query: "",
          subject: "",
          grade: "",
          location: "Sweden",
          verified: false,
        }}
        subjects={["Mathematics"]}
        grades={["Elementary"]}
        countries={["Denmark", "Sweden"]}
      />,
    );

    const location = screen.getByLabelText<HTMLSelectElement>("Location");
    const optionLabels = Array.from(location.options, (option) => option.text);

    expect(location).toHaveValue("Sweden");
    expect(optionLabels).toContain("All countries");
    expect(optionLabels).toEqual(["All countries", "Denmark", "Sweden"]);
  });
});
