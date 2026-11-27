import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import PlatformLayout from "@/app/(platform)/layout";
import { SessionAwareSiteShell } from "@/components/shared/session-aware-site-shell";
import { useNotifications } from "@/features/notifications/notification-provider";
import { PlatformShell } from "./platform-shell";

const mocks = vi.hoisted(() => ({
  currentAccount: vi.fn(),
  requiredAccount: vi.fn(),
  notificationRequest: vi.fn(),
  provider: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/about",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentAccount: mocks.currentAccount,
  requireCurrentAccount: mocks.requiredAccount,
}));
vi.mock("@/lib/billing/server", () => ({
  getBillingState: async () => ({ effectivePlan: "free" }),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    doc: () => ({
      get: async () => ({ data: () => ({ subjects: ["Science"] }) }),
    }),
  }),
}));
vi.mock("@/lib/firebase/client-auth", () => ({
  refreshFirebaseClientAuth: async () => {
    throw new Error("Realtime is outside this composition test.");
  },
}));
vi.mock("@/features/notifications/client", () => ({
  requestNotificationJson: mocks.notificationRequest,
}));
vi.mock(
  "@/features/notifications/notification-provider",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/notifications/notification-provider")
      >();
    return {
      ...actual,
      NotificationProvider: (
        props: Parameters<typeof actual.NotificationProvider>[0],
      ) => {
        mocks.provider(props.uid);
        return <actual.NotificationProvider {...props} />;
      },
    };
  },
);
vi.mock("@/features/presence/presence-heartbeat", () => ({
  PresenceHeartbeat: () => null,
}));
vi.mock("@/features/search/global-search", () => ({
  GlobalSearch: () => null,
}));
vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingHeader: () => <header>Marketing navigation</header>,
  MarketingFooter: () => <footer>Marketing footer</footer>,
}));

const account = {
  uid: "first-teacher",
  displayName: "Teacher",
  photoURL: null,
  role: "educator" as const,
  onboarded: true,
  subject: "Science",
};
const notificationPage = (unreadCount: number) => ({
  notifications: [],
  unreadCount,
  nextCursor: null,
});
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

function NotificationProbe() {
  const { page } = useNotifications();
  return (
    <output aria-label="Notification unread count">
      {page?.unreadCount ?? "loading"}
    </output>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentAccount.mockResolvedValue(account);
  mocks.requiredAccount.mockResolvedValue(account);
  mocks.notificationRequest.mockReset().mockResolvedValue(notificationPage(0));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => cleanup());
afterAll(() => {
  if (originalScrollTo)
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

it.each([
  ["authenticated marketing page", SessionAwareSiteShell],
  ["platform layout", PlatformLayout],
] as const)(
  "provides one notification context for the %s",
  async (_name, layout) => {
    render(await layout({ children: <NotificationProbe /> }));

    await waitFor(() =>
      expect(
        screen.getByLabelText("Notification unread count"),
      ).toHaveTextContent("0"),
    );
    expect(mocks.provider).toHaveBeenCalledExactlyOnceWith(account.uid);
    expect(mocks.notificationRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/notifications",
    );
  },
);

it("keeps signed-out marketing content outside authenticated notification work", async () => {
  mocks.currentAccount.mockResolvedValue(null);
  render(await SessionAwareSiteShell({ children: <p>About VistaTeacher</p> }));

  expect(screen.getByText("Marketing navigation")).toBeInTheDocument();
  expect(screen.getByText("About VistaTeacher")).toBeInTheDocument();
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(mocks.notificationRequest).not.toHaveBeenCalled();
});

it("resets notification state when the shell account changes", async () => {
  let resolveSecond!: (page: ReturnType<typeof notificationPage>) => void;
  const secondResponse = new Promise<ReturnType<typeof notificationPage>>(
    (resolve) => {
      resolveSecond = resolve;
    },
  );
  mocks.notificationRequest
    .mockResolvedValueOnce(notificationPage(7))
    .mockReturnValueOnce(secondResponse);
  const { rerender } = render(
    <PlatformShell account={account} plan="free">
      <NotificationProbe />
    </PlatformShell>,
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText("Notification unread count"),
    ).toHaveTextContent("7"),
  );

  rerender(
    <PlatformShell account={{ ...account, uid: "second-teacher" }} plan="free">
      <NotificationProbe />
    </PlatformShell>,
  );
  expect(screen.getByLabelText("Notification unread count")).toHaveTextContent(
    "loading",
  );
  await act(async () => resolveSecond(notificationPage(1)));
  expect(screen.getByLabelText("Notification unread count")).toHaveTextContent(
    "1",
  );
  expect(mocks.notificationRequest).toHaveBeenCalledTimes(2);
});
