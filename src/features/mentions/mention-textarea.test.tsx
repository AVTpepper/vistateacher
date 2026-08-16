import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MentionTextarea } from "@/features/mentions/mention-textarea";
import type { MentionTarget } from "@/lib/mentions/types";

const marlena = { uid: "marlena", displayName: "Marlena Kulasinska" };

function ControlledMentionTextarea() {
  const [value, setValue] = useState("");
  const [mentions, setMentions] = useState<MentionTarget[]>([]);
  return (
    <MentionTextarea
      aria-label="Comment"
      value={value}
      onValueChange={setValue}
      mentions={mentions}
      onMentionsChange={setMentions}
    />
  );
}

describe("MentionTextarea", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps suggestions closed after selecting a mention and continuing to type", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ educators: [marlena] }),
    });
    vi.stubGlobal("fetch", search);
    render(<ControlledMentionTextarea />);

    const comment = screen.getByRole("textbox", { name: "Comment" });
    fireEvent.change(comment, { target: { value: "@Mar" } });
    await act(async () => vi.advanceTimersByTimeAsync(200));

    fireEvent.click(screen.getByRole("option", { name: "Marlena Kulasinska" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.change(comment, {
      target: { value: "@Marlena Kulasinska thanks for sharing" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(200));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
  });
});
