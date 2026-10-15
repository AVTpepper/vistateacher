import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockLesson } from "@/lib/lessons/mock-provider";
import { LessonEditor } from "./lesson-editor";

const content = createMockLesson({
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Local ecosystems",
  durationMinutes: 50,
  objectives: "Explore food webs",
  standards: "",
  studentNeeds: "",
  teachingStyle: "inquiry",
});
const props = {
  recoveryKey: "editor:alice:lesson-one",
  currentVersion: 1,
  content,
  visibility: "draft" as const,
  saving: false,
  canRefine: true,
  onCancel: vi.fn(),
  onSave: vi.fn().mockResolvedValue(true),
  onRefine: vi.fn().mockResolvedValue(true),
};

describe("shared lesson editing", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("retains newlines while typing and normalizes list items only when saving", async () => {
    render(<LessonEditor {...props} />);
    const objectives = screen.getByLabelText("Objectives (one per line)");
    fireEvent.change(objectives, { target: { value: "First objective\n" } });
    expect(objectives).toHaveValue("First objective\n");
    fireEvent.change(objectives, {
      target: { value: "First objective\nSecond objective\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await waitFor(() =>
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          objectives: ["First objective", "Second objective"],
        }),
        "draft",
      ),
    );
  });

  it("associates errors with invalid fields and focuses the first one", async () => {
    render(<LessonEditor {...props} />);
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription();
    await waitFor(() => expect(title).toHaveFocus());
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("keeps recovery data and allows retry after a failed save", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<LessonEditor {...props} onSave={save} />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Keep this revision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Title")).toHaveValue("Keep this revision");
    expect(
      localStorage.getItem("vista:draft:v1:editor:alice:lesson-one"),
    ).toContain("Keep this revision");
    expect(screen.getByRole("button", { name: "Save version" })).toBeEnabled();
  });

  it("prevents edits and closing while a save is in flight", () => {
    render(<LessonEditor {...props} saving />);
    expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close editor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save version" })).toBeDisabled();
  });
});
