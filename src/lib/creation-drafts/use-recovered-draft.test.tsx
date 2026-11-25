import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRecoveredDraft } from "./use-recovered-draft";
import { z } from "zod";

function Editor({ owner = "alice" }: { owner?: string }) {
  const draft = useRecoveredDraft(`test:${owner}`, { title: "", content: "" });
  return (
    <>
      <input
        aria-label="Title"
        value={draft.value.title}
        onChange={(event) =>
          draft.setValue({ ...draft.value, title: event.target.value })
        }
      />
      <p>{draft.status}</p>
      {draft.restored && <p>Restored</p>}
      <button onClick={draft.clear}>Clear</button>
    </>
  );
}

describe("draft recovery", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("recovers incomplete work after a remount and clears it after success", () => {
    const first = render(<Editor />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "A" },
    });
    expect(screen.getByText("saved")).toBeInTheDocument();
    first.unmount();
    const second = render(<Editor />);
    expect(screen.getByLabelText("Title")).toHaveValue("A");
    expect(screen.getByText("Restored")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    second.unmount();
    render(<Editor />);
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("keeps drafts private to their account key", () => {
    const first = render(<Editor />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Alice's lesson" },
    });
    first.unmount();
    render(<Editor owner="bob" />);
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
  it("recovers mixed question types while rejecting malformed discriminated entries", () => {
    const initial = {
      items: [
        { type: "choice", prompt: "", options: [{ text: "" }] },
        { type: "short", prompt: "", responseLines: 3 },
      ],
    };
    function MixedEditor() {
      const draft = useRecoveredDraft("mixed", initial);
      return (
        <p>{draft.restored ? "Recovered mixed draft" : "New mixed draft"}</p>
      );
    }
    localStorage.setItem("vista:draft:v1:mixed", JSON.stringify(initial));
    const view = render(<MixedEditor />);
    expect(screen.getByText("Recovered mixed draft")).toBeInTheDocument();
    view.unmount();
    localStorage.setItem(
      "vista:draft:v1:mixed",
      JSON.stringify({
        items: [{ type: "choice", prompt: "missing options" }],
      }),
    );
    render(<MixedEditor />);
    expect(screen.getByText("New mixed draft")).toBeInTheDocument();
  });

  it("ignores malformed cached values", () => {
    localStorage.setItem(
      "vista:draft:v1:test:alice",
      JSON.stringify({ title: 42 }),
    );
    render(<Editor />);
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
  it("recovers a changed resource type in ordinary form objects", () => {
    localStorage.setItem(
      "vista:draft:v1:resource",
      JSON.stringify({ type: "worksheet", title: "My worksheet" }),
    );
    function ResourceEditor() {
      const draft = useRecoveredDraft("resource", {
        type: "activity",
        title: "",
      });
      return <p>{draft.value.type}</p>;
    }
    render(<ResourceEditor />);
    expect(screen.getByText("worksheet")).toBeInTheDocument();
  });

  it("restores an explicitly cleared optional field even when the server draft has a value", () => {
    const schema = z.object({
      recipient: z.object({ uid: z.string() }).nullable(),
      content: z.string(),
    });
    localStorage.setItem(
      "vista:draft:v1:optional",
      JSON.stringify({
        recipient: null,
        content: "Choose another recipient later",
      }),
    );
    function OptionalEditor() {
      const draft = useRecoveredDraft<{
        recipient: { uid: string } | null;
        content: string;
      }>(
        "optional",
        { recipient: { uid: "old-recipient" }, content: "" },
        schema,
      );
      return <p>{draft.value.recipient?.uid ?? draft.value.content}</p>;
    }
    render(<OptionalEditor />);
    expect(
      screen.getByText("Choose another recipient later"),
    ).toBeInTheDocument();
  });

  it("preserves editing and warns before reload when storage fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Full");
    });
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Keep my work" },
    });
    expect(screen.getByLabelText("Title")).toHaveValue("Keep my work");
    expect(screen.getByText("error")).toBeInTheDocument();
    const event = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });
});
