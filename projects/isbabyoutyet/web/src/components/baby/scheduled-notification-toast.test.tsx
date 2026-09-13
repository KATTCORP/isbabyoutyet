import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import {
  seedOwnedBaby,
  seedPendingLaborNotification,
  seedPushSubscriptions,
  signUpTestUser,
} from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { ScheduledNotificationToast } from "./scheduled-notification-toast";

async function renderToastResource(
  harness: Awaited<ReturnType<typeof createConvexTestHarness>>,
  ui: React.ReactElement,
) {
  return renderWithConvexTest({ harness, ui, wrap: null });
}

test("runs with empty notifications and no subscriptions", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const notifications = await harness.convexPreloader.ensureQueryData(
    api.baby.getScheduledNotifications,
    { babyId: baby.babyId },
  );
  const subscriptionCount = await harness.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getSubscriptionCount,
    { babyId: baby.babyId },
  );

  await using view = await renderToastResource(
    harness,
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  // The toast renders an <aside aria-live="polite"> when active, nothing when empty.
  expect(view.queryByRole("complementary")).toBeNull();
});

test("treats forbidden notification data as empty", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const visitorId = await signUpTestUser(harness, {
    email: "visitor@example.com",
    name: "Visitor",
    password: "password123",
  });
  harness.withIdentity({ subject: visitorId });

  const notifications = await harness.convexPreloader.ensureQueryData(
    api.baby.getScheduledNotifications,
    { babyId: baby.babyId },
  );
  const subscriptionCount = await harness.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getSubscriptionCount,
    { babyId: baby.babyId },
  );
  await using view = await renderToastResource(
    harness,
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  // The toast renders an <aside aria-live="polite"> when active, nothing when empty.
  expect(view.queryByRole("complementary")).toBeNull();
});

test("shows the exact subscriber count in a pending notification toast", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await seedPendingLaborNotification(harness, { babyId: baby.babyId });
  await seedPushSubscriptions(harness, { babyId: baby.babyId, count: 3 });

  const notifications = await harness.convexPreloader.ensureQueryData(
    api.baby.getScheduledNotifications,
    { babyId: baby.babyId },
  );
  const subscriptionCount = await harness.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getSubscriptionCount,
    { babyId: baby.babyId },
  );

  await using view = await renderToastResource(
    harness,
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  expect(view.container.textContent).toContain("3 people");
  expect(view.container.textContent).toContain("Sending notification...");
  fireEvent.click(view.getByRole("button", { name: "Cancel" }));
  await vi.waitFor(() => {
    expect(view.queryByText("Sending notification...")).toBeNull();
  });
});

test("shows a pending notification countdown even with no subscribers", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await seedPendingLaborNotification(harness, { babyId: baby.babyId });

  const notifications = await harness.convexPreloader.ensureQueryData(
    api.baby.getScheduledNotifications,
    { babyId: baby.babyId },
  );
  const subscriptionCount = await harness.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getSubscriptionCount,
    { babyId: baby.babyId },
  );

  await using view = await renderToastResource(
    harness,
    <ScheduledNotificationToast
      notifications={notifications}
      subscriptionCount={subscriptionCount}
    />,
  );

  expect(view.container.textContent).toContain("Sending notification...");
  expect(view.container.textContent).toContain("No one is subscribed yet");
  expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
});
