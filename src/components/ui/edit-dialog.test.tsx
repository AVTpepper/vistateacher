import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditTextDialog } from "@/components/ui/edit-dialog";

function renderDialog(onSave: (value: string) => Promise<void>) {
  render(
    <EditTextDialog
      trigger={<button type="button">Edit note</button>}
      title="Edit note"
      description="Update this note."
      label="Note"
      value="Original note"
      maxLength={100}
      onSave={onSave}
    />,
  );
}

describe("EditTextDialog", () => {
  it("resets cancelled drafts and trims successful saves", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog(onSave);

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Discard this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    expect(screen.getByLabelText("Note")).toHaveValue("Original note");
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "  Updated note  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Updated note"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open and exposes save failures", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Save unavailable."));
    renderDialog(onSave);

    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Changed note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save unavailable.",
    );
    expect(screen.getByRole("dialog", { name: "Edit note" })).toBeVisible();
    expect(screen.getByLabelText("Note")).toHaveValue("Changed note");
  });
});
