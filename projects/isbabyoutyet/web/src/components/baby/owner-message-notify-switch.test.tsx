import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeAsyncResource, makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { testPreloadedQuery } from "@workspace/query-prefetch/test-helpers";
import { Dialog, DialogContent } from "@workspace/ui/components/dialog";
import { LocaleProvider } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby } from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { browserPushQueryOptions } from "./notification-subscribe";
import {
  OwnerMessageNotifyLiveSwitch,
  OwnerMessageNotifySwitchView,
} from "./owner-message-notify-switch";

const ENDPOINT = "https://push.example/owner-messages";

function pushSubscription() {
  // SAFETY: Test fixture is a subset of the production type.
  return {
    endpoint: ENDPOINT,
    toJSON: (): PushSubscriptionJSON => ({
      endpoint: ENDPOINT,
      keys: { auth: "auth", p256dh: "p256" },
    }),
  } as PushSubscription;
}

function stubGrantedPush(opts: { existing: PushSubscription | null }) {
  const restore: Array<() => void> = [];
  let current = opts.existing;

  function replaceProperty<$Target extends object>(
    target: $Target,
    property: { descriptor: PropertyDescriptor; key: string },
  ) {
    const existing = Object.getOwnPropertyDescriptor(target, property.key);
    Object.defineProperty(target, property.key, { configurable: true, ...property.descriptor });
    restore.push(() => {
      if (existing) {
        Object.defineProperty(target, property.key, existing);
        return;
      }
      Reflect.deleteProperty(target, property.key);
    });
  }

  const NotificationStub = function Notification() {};
  Object.defineProperty(NotificationStub, "permission", {
    configurable: true,
    get: () => "granted",
  });
  replaceProperty(globalThis, {
    descriptor: { value: NotificationStub },
    key: "Notification",
  });

  // SAFETY: Test fixture is a subset of the production type.
  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(current),
      subscribe: () => {
        current = pushSubscription();
        return Promise.resolve(current);
      },
    },
  } as ServiceWorkerRegistration;
  replaceProperty(navigator, {
    descriptor: { value: { ready: Promise.resolve(registration) } },
    key: "serviceWorker",
  });

  return makeResource({}, () => {
    for (const fn of restore.toReversed()) {
      fn();
    }
  });
}

async function renderLiveSwitch(opts: {
  capability:
    | { kind: "unsupported" }
    | { kind: "needsIosInstall" }
    | { kind: "serviceWorkerTimeout" }
    | { kind: "unsubscribed" }
    | {
        family: boolean;
        kind: "subscribed";
        messages: boolean;
        subscription: PushSubscription;
      };
}) {
  const harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const vapid = await harness.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getPublicKey,
    {},
  );
  const view = await renderWithConvexTest({
    harness,
    ui: (
      <OwnerMessageNotifyLiveSwitch
        babyId={baby.babyId}
        browserPush={testPreloadedQuery(
          (ref) => browserPushQueryOptions(harness.queryClient, ref),
          opts.capability,
          baby.publicId,
        )}
        vapidPublicKey={vapid}
      />
    ),
    wrap: null,
  });
  return makeAsyncResource({ babyId: baby.babyId, harness, view }, async () => {
    view[Symbol.dispose]();
    await harness[Symbol.asyncDispose]();
  });
}

test("settings switch describes visitor message alerts", async () => {
  const onCheckedChange = vi.fn<(checked: boolean) => void>();
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <OwnerMessageNotifySwitchView
        checked={false}
        disabled={false}
        disabledReason={null}
        layout="settings"
        onCheckedChange={onCheckedChange}
      />
    </LocaleProvider>,
  );

  const notifySwitch = view.getByRole("switch", { name: "Message notifications" });
  expect(notifySwitch.getAttribute("aria-checked")).toBe("false");
  expect(view.getByText("Get notified when someone leaves a message")).toBeTruthy();

  fireEvent.click(notifySwitch);
  expect(onCheckedChange.mock.calls[0]?.[0]).toBe(true);
});

test("settings switch shows subscribed copy when on", async () => {
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <OwnerMessageNotifySwitchView
        checked={true}
        disabled={false}
        disabledReason={null}
        layout="settings"
        onCheckedChange={vi.fn()}
      />
    </LocaleProvider>,
  );

  expect(
    view.getByRole("switch", { name: "Message notifications" }).getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    view.getByText("You'll get a push when someone leaves a message on this page."),
  ).toBeTruthy();
});

test("settings switch opens Home Screen instructions when iOS needs a PWA install", async () => {
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <Dialog open>
        <DialogContent>
          <OwnerMessageNotifySwitchView
            checked={false}
            disabled={true}
            disabledReason="needsIosInstall"
            layout="settings"
            onCheckedChange={null}
          />
        </DialogContent>
      </Dialog>
    </LocaleProvider>,
  );

  const notifyButton = view.getByRole("button", { name: "Get Notifications" });
  fireEvent.click(notifyButton);

  expect(view.getByText("Get Notifications on iOS")).toBeTruthy();
  expect(view.getByText(/Add to Home Screen/i)).toBeTruthy();
  expect(view.getByText(/does not inherit your Safari login/i)).toBeTruthy();
  // Nested dialogs skip their backdrop unless forceRender is set.
  expect(view.baseElement.querySelectorAll('[data-slot="dialog-overlay"]').length).toBeGreaterThan(
    1,
  );
});

test("settings switch explains when the browser cannot push", async () => {
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <OwnerMessageNotifySwitchView
        checked={false}
        disabled={true}
        disabledReason="unsupported"
        layout="settings"
        onCheckedChange={null}
      />
    </LocaleProvider>,
  );

  expect(view.getByText("Push notifications are not supported in this browser.")).toBeTruthy();
});

test("live switch is off until the owner opts into message alerts", async () => {
  await using ctx = await renderLiveSwitch({ capability: { kind: "unsubscribed" } });

  expect(
    ctx.view.getByRole("switch", { name: "Message notifications" }).getAttribute("aria-checked"),
  ).toBe("false");
  expect(ctx.view.getByText("Get notified when someone leaves a message")).toBeTruthy();
});

function disabledAttr(notifySwitch: HTMLElement) {
  return (
    notifySwitch.getAttribute("data-disabled") ??
    notifySwitch.getAttribute("aria-disabled") ??
    notifySwitch.getAttribute("disabled")
  );
}

test("live switch stays disabled when push is unsupported", async () => {
  await using ctx = await renderLiveSwitch({ capability: { kind: "unsupported" } });

  expect(
    disabledAttr(ctx.view.getByRole("switch", { name: "Message notifications" })),
  ).not.toBeNull();
  expect(ctx.view.getByText("Push notifications are not supported in this browser.")).toBeTruthy();
});

test("live switch opens Home Screen instructions when iOS needs a PWA install", async () => {
  await using ctx = await renderLiveSwitch({ capability: { kind: "needsIosInstall" } });

  fireEvent.click(ctx.view.getByRole("button", { name: "Get Notifications" }));

  expect(ctx.view.getByText("Get Notifications on iOS")).toBeTruthy();
  expect(ctx.view.getByText(/Add to Home Screen/i)).toBeTruthy();
  expect(ctx.view.getByText(/does not inherit your Safari login/i)).toBeTruthy();
});

test("live switch stays disabled while the service worker is not ready", async () => {
  await using ctx = await renderLiveSwitch({ capability: { kind: "serviceWorkerTimeout" } });

  expect(
    disabledAttr(ctx.view.getByRole("switch", { name: "Message notifications" })),
  ).not.toBeNull();
});

test("turning the live switch on stores an owner message subscription", async () => {
  await using _env = stubGrantedPush({ existing: pushSubscription() });
  await using ctx = await renderLiveSwitch({ capability: { kind: "unsubscribed" } });

  fireEvent.click(ctx.view.getByRole("switch", { name: "Message notifications" }));

  await vi.waitFor(async () => {
    expect(
      await ctx.harness.client.query(api.pushSubscriptions.isOwnerSubscribed, {
        babyId: ctx.babyId,
        endpoint: ENDPOINT,
      }),
    ).toBe(true);
  });
});

test("turning the live switch off removes the owner message subscription", async () => {
  const subscription = pushSubscription();
  await using _env = stubGrantedPush({ existing: subscription });
  await using ctx = await renderLiveSwitch({
    capability: {
      family: false,
      kind: "subscribed",
      messages: true,
      subscription,
    },
  });

  await ctx.harness.client.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "auth",
    babyId: ctx.babyId,
    endpoint: ENDPOINT,
    p256dh: "p256",
    userAgent: "vitest",
  });

  expect(
    ctx.view.getByRole("switch", { name: "Message notifications" }).getAttribute("aria-checked"),
  ).toBe("true");

  fireEvent.click(ctx.view.getByRole("switch", { name: "Message notifications" }));

  await vi.waitFor(async () => {
    expect(
      await ctx.harness.client.query(api.pushSubscriptions.isOwnerSubscribed, {
        babyId: ctx.babyId,
        endpoint: ENDPOINT,
      }),
    ).toBe(false);
  });
});
