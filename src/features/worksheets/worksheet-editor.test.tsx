import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorksheetEditor } from "./worksheet-editor";
import { createMockWorksheet } from "@/lib/worksheets/mock-provider";
import { worksheetSourceSchema } from "@/schemas/worksheet";

const source = worksheetSourceSchema.parse({
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Local food webs",
  difficulty: "core",
  questionCounts: {
    multipleChoice: 1,
    shortAnswer: 0,
    extendedResponse: 0,
    matching: 0,
    fillInBlank: 0,
    trueFalse: 0,
  },
});
afterEach(() => localStorage.clear());
describe("worksheet teacher edits", () => {
  it("requires an answer review after question edits and recovers that requirement with the draft", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const props = {
      uid: "teacher",
      worksheetId: "private-worksheet",
      content: createMockWorksheet(source),
      version: 1,
      pending: false,
      onSave,
      onCancel: vi.fn(),
    };
    const first = render(<WorksheetEditor {...props} />);
    fireEvent.change(screen.getAllByLabelText("Question", { exact: true })[0], {
      target: { value: "Which organism is a producer?" },
    });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    first.unmount();
    render(<WorksheetEditor {...props} />);
    expect(
      screen.getAllByLabelText("Question", { exact: true })[0],
    ).toHaveValue("Which organism is a producer?");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I reviewed the answer for question 1",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].questions[0].prompt).toBe(
      "Which organism is a producer?",
    );
    expect(onSave.mock.calls[0][1]).toBe(1);
  });
  it("allows response-space changes without requiring an unrelated answer review", () => {
    render(
      <WorksheetEditor
        uid="teacher"
        worksheetId="private-worksheet"
        content={createMockWorksheet({
          ...source,
          questionCounts: {
            ...source.questionCounts,
            multipleChoice: 0,
            shortAnswer: 1,
          },
        })}
        version={1}
        pending={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(
      screen.getAllByLabelText("Answer lines on the student worksheet")[0],
      { target: { value: "5" } },
    );
    expect(
      screen.queryByRole("checkbox", { name: /I reviewed the answer/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
