import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { FORBIDDEN } from "@baby-outlet/backend/src/types";
import { testPreloadedConvexQuery } from "@workspace/convex-prefetch/test-helpers";

const mocks = vi.hoisted(() => ({
  useSuspenseQuery: vi.fn<(options: { initialData: unknown }) => { data: unknown }>(),
  custom: vi.fn<(...args: unknown[]) => string | number>(),
  dismiss: vi.fn<(id: string | number | undefined) => void>(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (options: { initialData: unknown }) => mocks.useSuspenseQuery(options),
    useMutation: () => ({ isPending: false, mutate: vi.fn<(args: unknown) => void>() }),
  };
});

vi.mock("@convex-dev/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@convex-dev/react-query")>();
  return {
    ...actual,
    useConvexMutation: () => vi.fn<() => Promise<null>>().mockResolvedValue(null),
  };
});

vi.mock("sonner", () => ({
  toast: {
    custom: mocks.custom,
    dismiss: mocks.dismiss,
    success: vi.fn<(message: string) => void>(),
  },
}));

const { ScheduledNotificationToast } = await import("./scheduled-notification-toast");

const babyId = "jd7baby000000000000000000" as Id<"baby">;

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("runs with empty notifications and no subscriptions", async () => {
  const notifications = testPreloadedConvexQuery<typeof api.baby.getScheduledNotifications>({
    input: { babyId },
    initialData: [],
  });
  const subscriptionCount = testPreloadedConvexQuery<
    typeof api.pushSubscriptions.getSubscriptionCount
  >({
    input: { babyId },
    initialData: 0,
  });
  mocks.useSuspenseQuery.mockImplementation((options) => ({
    data: options.initialData,
  }));

  await using view = renderResource(
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  expect(view.container.firstChild).toBeNull();
  expect(mocks.custom).not.toHaveBeenCalled();
});

test("treats forbidden notification data as empty", async () => {
  const notifications = testPreloadedConvexQuery<typeof api.baby.getScheduledNotifications>({
    input: { babyId },
    initialData: FORBIDDEN,
  });
  const subscriptionCount = testPreloadedConvexQuery<
    typeof api.pushSubscriptions.getSubscriptionCount
  >({
    input: { babyId },
    initialData: FORBIDDEN,
  });
  mocks.useSuspenseQuery.mockImplementation((options) => ({
    data: options.initialData,
  }));

  await using view = renderResource(
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  expect(view.container.firstChild).toBeNull();
  expect(mocks.custom).not.toHaveBeenCalled();
});

test("shows the exact subscriber count in a pending notification toast", async () => {
  const notificationId = "jd7sched0000000000000000" as Id<"scheduledNotifications">;
  const notifications = testPreloadedConvexQuery<typeof api.baby.getScheduledNotifications>({
    input: { babyId },
    initialData: [
      {
        _id: notificationId,
        _creationTime: Date.now(),
        babyId,
        createdAt: Date.now(),
        status: "pending" as const,
        notificationType: "labor_started" as const,
        scheduledFor: Date.now() + 60_000,
        customMessage: null,
        scheduledId: "sched-1" as Id<"_scheduled_functions">,
      },
    ],
  });
  const subscriptionCount = testPreloadedConvexQuery<
    typeof api.pushSubscriptions.getSubscriptionCount
  >({
    input: { babyId },
    initialData: 3,
  });
  mocks.useSuspenseQuery.mockImplementation((options) => ({
    data: options.initialData,
  }));

  await using view = renderResource(
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  expect(view.container.firstChild).toBeNull();
  expect(mocks.custom).toHaveBeenCalled();
  const renderToast = mocks.custom.mock.calls[0]?.[0];
  if (typeof renderToast !== "function") throw new Error("Toast renderer missing");
  await using toastView = renderResource(renderToast() as React.ReactElement);
  expect(toastView.container.textContent).toContain("3 people");
});
