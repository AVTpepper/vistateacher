import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

it("keeps a failed deletion open and lets the user retry", async () => {
  const remove = vi
    .fn()
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce(undefined);
  render(
    <DeleteConfirmDialog itemName="post" onConfirm={remove}>
      <button>Remove post</button>
    </DeleteConfirmDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove post" }));
  fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
  expect(remove).toHaveBeenCalledTimes(2);
});
