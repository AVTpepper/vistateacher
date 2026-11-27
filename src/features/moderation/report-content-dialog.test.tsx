import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportContentDialog } from "./report-content-dialog";

const notices = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: notices }));

const endpoint = "/api/messages/actual-conversation/report";
const details = "Keep the unsafe classroom example for moderator review.";
const payload = { messageId: "message-one" };
const reply = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const renderDialog = () => {
  render(
    <ReportContentDialog
      title="Report message"
      endpoint={endpoint}
      payload={payload}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Report message" }));
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "unsafe" },
  });
  fireEvent.change(screen.getByLabelText("Details (optional)"), {
    target: { value: details },
  });
};
const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("report dialog recovery and acknowledgement", () => {
  it("leaves prior feedback alone while closed and dismisses it once on each actual opening", async () => {
    const dialog = (
      <ReportContentDialog
        title="Report message"
        endpoint={endpoint}
        payload={payload}
      />
    );
    const { rerender } = render(dialog);
    notices.info("An earlier action completed.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(notices.dismiss).not.toHaveBeenCalled();
    rerender(dialog);
    expect(notices.dismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Report message" }));
    expect(
      screen.getByRole("dialog", { name: "Report message" }),
    ).toBeVisible();
    expect(notices.dismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(notices.dismiss).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Report message" }));
    expect(
      screen.getByRole("dialog", { name: "Report message" }),
    ).toBeVisible();
    expect(notices.dismiss).toHaveBeenCalledTimes(2);
  });

  it("preserves feedback created after opening through draft changes, submission and successful closing", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    renderDialog();
    expect(notices.dismiss).toHaveBeenCalledTimes(1);
    notices.info("Another action completed after this dialog opened.");
    fireEvent.change(screen.getByLabelText("Details (optional)"), {
      target: { value: `${details} Keep the new feedback available.` },
    });
    expect(notices.dismiss).toHaveBeenCalledTimes(1);
    submit();
    expect(
      screen.getByRole("button", { name: "Submitting..." }),
    ).toBeDisabled();
    expect(notices.dismiss).toHaveBeenCalledTimes(1);
    await act(async () => resolve(reply({ reported: true })));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(notices.success).toHaveBeenCalledExactlyOnceWith(
      "Report submitted for review.",
    );
    expect(notices.dismiss).toHaveBeenCalledTimes(1);
    expect(notices.dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      notices.info.mock.invocationCallOrder[0],
    );
    expect(notices.dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      notices.success.mock.invocationCallOrder[0],
    );
  });

  it("keeps the reason and details after a network failure, then retries the same payload only after explicit submission", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(reply({ reported: true }));
    vi.stubGlobal("fetch", fetch);
    renderDialog();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your details are kept; please try again.",
    );
    expect(screen.getByLabelText("Reason")).toHaveValue("unsafe");
    expect(screen.getByLabelText("Details (optional)")).toHaveValue(details);
    expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Close report message" }),
    ).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(notices.success).not.toHaveBeenCalled();

    submit();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [path, init] of fetch.mock.calls) {
      expect(path).toBe(endpoint);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
      expect(JSON.parse(init.body)).toEqual({
        ...payload,
        reason: "unsafe",
        details,
      });
    }
    expect(notices.success).toHaveBeenCalledExactlyOnceWith(
      "Report submitted for review.",
    );
    expect(notices.info).not.toHaveBeenCalled();
  });

  it("sends one request during a double activation and prevents closing or changing the in-flight report", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const user = userEvent.setup();
    renderDialog();
    const button = screen.getByRole("button", { name: "Submit report" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      signal: expect.any(AbortSignal),
    });
    expect(
      screen.getByRole("button", { name: "Submitting..." }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Close report message" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Reason")).toBeDisabled();
    expect(screen.getByLabelText("Details (optional)")).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Report message" }),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve(reply({ reported: true })));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it.each([
    [
      "non-JSON success",
      () => new Response("interrupted JSON", { status: 201 }),
    ],
    ["an acknowledgement without reported true", () => reply({ ok: true })],
    [
      "a truthy string in place of the boolean receipt",
      () => reply({ reported: "true" }),
    ],
  ] as const)("does not claim success for %s", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    renderDialog();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't submit this report.",
    );
    expect(
      screen.getByRole("dialog", { name: "Report message" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Details (optional)")).toHaveValue(details);
    expect(screen.getByLabelText("Reason")).toHaveValue("unsafe");
    expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.info).not.toHaveBeenCalled();
  });

  it("closes with an informational receipt for the explicit already-reported response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply({ code: "already-reported" }, 409)),
    );
    renderDialog();
    submit();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(notices.info).toHaveBeenCalledExactlyOnceWith(
      "We already have your report for this content.",
    );
    expect(notices.success).not.toHaveBeenCalled();
  });

  it("keeps an unrelated conflict open instead of treating every 409 as a prior report", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          reply({ code: "conflict", error: "This request needs review." }, 409),
        ),
    );
    renderDialog();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This request needs review.",
    );
    expect(screen.getByLabelText("Details (optional)")).toHaveValue(details);
    expect(notices.success).not.toHaveBeenCalled();
    expect(notices.info).not.toHaveBeenCalled();
  });

  it.each(["TimeoutError", "AbortError"])(
    "retains the report and re-enables submission after %s",
    async (name) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new DOMException("Transport ended", name)),
      );
      renderDialog();
      submit();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Your details are kept; please try again.",
      );
      expect(screen.getByLabelText("Reason")).toHaveValue("unsafe");
      expect(screen.getByLabelText("Details (optional)")).toHaveValue(details);
      expect(
        screen.getByRole("button", { name: "Submit report" }),
      ).toBeEnabled();
      expect(notices.success).not.toHaveBeenCalled();
    },
  );
});
