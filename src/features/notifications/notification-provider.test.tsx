import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  NotificationProvider,
  useNotifications,
} from "./notification-provider";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  router: { push: vi.fn() },
}));
vi.mock("@/lib/http/client", () => ({ requestJson: mocks.request }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/firebase/client-auth", () => ({
  refreshFirebaseClientAuth: async () => {
    throw new Error("no realtime");
  },
}));
vi.mock("sonner", () => ({ toast: { message: vi.fn() } }));

function Consumer() {
  const { page, error, refresh } = useNotifications();
  return (
    <>
      <output aria-label="Unread count">
        {page?.unreadCount ?? "loading"}
      </output>
      <span>{error ? "unavailable" : "available"}</span>
      <button onClick={() => void refresh()}>Refresh count</button>
    </>
  );
}
const data = (unreadCount: number) => ({
  notifications: [],
  nextCursor: null,
  unreadCount,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => mocks.request.mockReset());
afterEach(() => vi.clearAllMocks());

it("retains the exact last known count on failure and recovers on retry", async () => {
  mocks.request
    .mockResolvedValueOnce(data(125))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(data(124));
  render(
    <NotificationProvider uid="teacher">
      <Consumer />
    </NotificationProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Unread count")).toHaveTextContent("125"),
  );
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("unavailable");
  expect(screen.getByLabelText("Unread count")).toHaveTextContent("125");
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByLabelText("Unread count")).toHaveTextContent("124"),
  );
  expect(screen.getByText("available")).toBeVisible();
});

it("serializes refreshes and replays invalidation received during an older request", async () => {
  const first = deferred<ReturnType<typeof data>>();
  mocks.request
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(data(124));
  render(
    <NotificationProvider uid="teacher">
      <Consumer />
    </NotificationProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button"));
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve(data(125)));
  await waitFor(() =>
    expect(screen.getByLabelText("Unread count")).toHaveTextContent("124"),
  );
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it("does not publish the old account's outstanding response after an account switch", async () => {
  const first = deferred<ReturnType<typeof data>>();
  mocks.request
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(data(2));
  const view = render(
    <NotificationProvider key="first" uid="first">
      <Consumer />
    </NotificationProvider>,
  );
  view.rerender(
    <NotificationProvider key="second" uid="second">
      <Consumer />
    </NotificationProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Unread count")).toHaveTextContent("2"),
  );
  await act(async () => first.resolve(data(99)));
  expect(screen.getByLabelText("Unread count")).toHaveTextContent("2");
});

it("refreshes only the aggregate on window focus, without downloading the list again", async () => {
  mocks.request
    .mockResolvedValueOnce(data(125))
    .mockResolvedValueOnce({ unreadCount: 123 });
  render(
    <NotificationProvider uid="teacher">
      <Consumer />
    </NotificationProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Unread count")).toHaveTextContent("125"),
  );
  fireEvent.focus(window);
  await waitFor(() =>
    expect(screen.getByLabelText("Unread count")).toHaveTextContent("123"),
  );
  expect(mocks.request.mock.calls.map(([url]) => url)).toEqual([
    "/api/notifications",
    "/api/notifications?summary=true",
  ]);
});
