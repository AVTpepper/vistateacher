import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminReportsView } from "@/features/admin/admin-views";
import type { AdminReportRow } from "@/lib/admin/server";

vi.mock("@/features/admin/admin-action-button", () => ({
  AdminActionButton: ({
    label,
    action,
  }: {
    label: string;
    action: {
      action: string;
      targetId: string;
      targetType?: string;
      parentId?: string | null;
    };
  }) => (
    <button
      data-action={action.action}
      data-target-id={action.targetId}
      data-target-type={action.targetType}
      data-parent-id={action.parentId}
    >
      {label}
    </button>
  ),
}));

const report = (overrides: Partial<AdminReportRow> = {}): AdminReportRow => ({
  id: "old-report",
  reporterId: "peer",
  targetType: "resource",
  targetId: "old-resource",
  parentId: null,
  reason: "unsafe",
  details: "Please review.",
  status: "open",
  createdAt: null,
  target: {
    type: "resource",
    id: "old-resource",
    parentId: null,
    title: "Reported classroom resource",
    preview: "Exact reported content preview.",
    moderationStatus: "approved",
    announcement: null,
  },
  ...overrides,
});

describe("reported-content administrator controls", () => {
  it("offers exact-target content moderation independently from resolving a report", () => {
    render(<AdminReportsView reports={[report()]} />);
    expect(screen.getByText("Reported classroom resource")).toBeInTheDocument();
    expect(
      screen.getByText("Exact reported content preview."),
    ).toBeInTheDocument();
    const hide = screen.getByRole("button", { name: "Hide content" });
    expect(hide).toHaveAttribute("data-target-id", "old-resource");
    expect(hide).toHaveAttribute("data-target-type", "resource");
    const resolve = screen.getByRole("button", { name: "Resolve" });
    expect(resolve).toHaveAttribute("data-target-id", "old-report");
    expect(resolve).toHaveAttribute("data-action", "report.resolve");
  });

  it("still offers moderation for a hidden target after its report is resolved", () => {
    const fixture = report();
    fixture.status = "resolved";
    fixture.target!.moderationStatus = "rejected";
    render(<AdminReportsView reports={[fixture]} />);
    expect(
      screen.getByRole("button", { name: "Approve content" }),
    ).toHaveAttribute("data-target-id", "old-resource");
    expect(
      screen.queryByRole("button", { name: "Resolve" }),
    ).not.toBeInTheDocument();
  });

  it("allows an orphan report to be resolved without offering content actions", () => {
    render(<AdminReportsView reports={[report({ target: null })]} />);
    expect(
      screen.getByText("Content removed or unavailable for review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hide content" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve content" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes approval of an independently rejected legacy announcement", () => {
    const fixture = report();
    fixture.target!.announcement = {
      id: "legacy-announcement",
      moderationStatus: "rejected",
    };
    render(<AdminReportsView reports={[fixture]} />);
    expect(
      screen.getByRole("button", { name: "Approve announcement" }),
    ).toHaveAttribute("data-target-id", "legacy-announcement");
    expect(
      screen.getByRole("button", { name: "Hide content" }),
    ).toHaveAttribute("data-target-id", "old-resource");
  });
});
