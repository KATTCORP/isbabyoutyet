import { fireEvent, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { makeAsyncResource, makeResource } from "@baby-outlet/backend/convex/test.resource";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { testPreloadedQuery } from "@workspace/query-prefetch/test-helpers";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { installMatchMediaStub } from "@/test/stubJsdomWindow";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import {
  browserPushQueryOptions,
  ManagerNotificationChooserView,
  NotificationSubscribe,
  prefetchBrowserPushCapability,
} from "./notification-subscribe";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const babyRef = "baby-smith";

type BrowserPushCapability =
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

type BrowserPushStub = {
  displayModeStandalone: boolean;
  hasNotification: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  serviceWorkerReady: Promise<ServiceWorkerRegistration>;
  standalone: boolean;
  subscription: PushSubscription | null;
  userAgent: string;
};

// SAFETY: Seeded convex-test document id.
const babyId = "jd7baby000000000000000000" as Id<"baby">;

function stubBrowserPush(stub: Partial<BrowserPushStub>) {
  const restore: Array<() => void> = [];

  function replaceProperty<$Target extends object>(
    target: $Target,
    opts: { descriptor: PropertyDescriptor; key: string },
  ) {
    const existing = Object.getOwnPropertyDescriptor(target, opts.key);
    Object.defineProperty(target, opts.key, { configurable: true, ...opts.descriptor });
    restore.push(() => {
      if (existing) {
        Object.defineProperty(target, opts.key, existing);
        return;
      }
      Reflect.deleteProperty(target, opts.key);
    });
  }

  if (stub.userAgent !== undefined) {
    replaceProperty(navigator, { descriptor: { get: () => stub.userAgent }, key: "userAgent" });
  }
  replaceProperty(navigator, {
    descriptor: { value: stub.standalone ?? false },
    key: "standalone",
  });

  restore.push(
    installMatchMediaStub(
      (query) => query === "(display-mode: standalone)" && Boolean(stub.displayModeStandalone),
    ),
  );

  if (stub.hasPushManager) {
    replaceProperty(window, {
      descriptor: { value: function PushManager() {} },
      key: "PushManager",
    });
  } else if ("PushManager" in window) {
    const existing = Object.getOwnPropertyDescriptor(window, "PushManager");
    Reflect.deleteProperty(window, "PushManager");
    restore.push(() => {
      if (existing) {
        Object.defineProperty(window, "PushManager", existing);
      }
    });
  }

  if (stub.hasNotification) {
    replaceProperty(window, {
      descriptor: { value: function Notification() {} },
      key: "Notification",
    });
  } else if ("Notification" in window) {
    const existing = Object.getOwnPropertyDescriptor(window, "Notification");
    Reflect.deleteProperty(window, "Notification");
    restore.push(() => {
      if (existing) {
        Object.defineProperty(window, "Notification", existing);
      }
    });
  }

  if (stub.hasServiceWorker) {
    // SAFETY: Test fixture is a subset of the production type.
    const registration = {
      pushManager: {
        getSubscription: () => Promise.resolve(stub.subscription ?? null),
      },
    } as ServiceWorkerRegistration;
    replaceProperty(navigator, {
      descriptor: {
        value: {
          ready: stub.serviceWorkerReady ?? Promise.resolve(registration),
        },
      },
      key: "serviceWorker",
    });
  }

  return makeResource({}, () => {
    for (const fn of restore.toReversed()) {
      fn();
    }
  });
}

function queryClientResource(isSubscribedInConvex = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: (ctx) => {
          const name = String(ctx.queryKey[1]);
          if (name === "pushSubscriptions:isSubscribed") {
            return Promise.resolve(isSubscribedInConvex);
          }
          if (name === "pushSubscriptions:isOwnerSubscribed") {
            return Promise.resolve(isSubscribedInConvex);
          }
          return Promise.reject(new Error(`unexpected query ${name}`));
        },
        retry: false,
      },
    },
  });
  return makeResource(queryClient, () => {
    queryClient.clear();
  });
}

async function renderSubscribe(capability: BrowserPushCapability, audience: "visitor" | "manager") {
  const harnessCtx = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harnessCtx, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  const vapid = await harnessCtx.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getPublicKey,
    {},
  );
  const view = await renderWithConvexTest({
    harness: harnessCtx,
    ui: (
      <TooltipProvider>
        <NotificationSubscribe
          audience={audience}
          babyId={babyId}
          browserPush={testPreloadedQuery(
            (ref) => browserPushQueryOptions(harnessCtx.queryClient, ref),
            capability,
            babyRef,
          )}
          vapidPublicKey={vapid}
        />
      </TooltipProvider>
    ),
    wrap: null,
  });
  return makeAsyncResource(view, async () => {
    view[Symbol.dispose]();
    await harnessCtx[Symbol.asyncDispose]();
  });
}

test("reports unsupported when the browser has no push APIs", async () => {
  await using queryClient = queryClientResource();

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({ kind: "unsupported" });
});

test("asks iOS Safari to install as a PWA before offering push", async () => {
  await using queryClient = queryClientResource();
  await using _env = stubBrowserPush({
    displayModeStandalone: false,
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    standalone: false,
    userAgent: IPHONE_SAFARI_UA,
  });

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({ kind: "needsIosInstall" });
});

test("reports unsupported when PushManager is missing", async () => {
  await using queryClient = queryClientResource();
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: false,
    hasServiceWorker: true,
  });

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({ kind: "unsupported" });
});

test("treats a ready browser with no push subscription as unsubscribed", async () => {
  await using queryClient = queryClientResource();
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    subscription: null,
  });

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({ kind: "unsubscribed" });
});

test("returns the existing browser push subscription and Convex isSubscribed", async () => {
  await using queryClient = queryClientResource(true);
  // SAFETY: Test fixture is a subset of the production type.
  const subscription = {
    endpoint: "https://push.example/subscription",
  } as PushSubscription;
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    subscription,
  });

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({
    family: true,
    kind: "subscribed",
    messages: true,
    subscription,
  });
});

test("lets an installed iOS PWA subscribe instead of showing the install guide", async () => {
  await using queryClient = queryClientResource();
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    standalone: true,
    subscription: null,
    userAgent: IPHONE_SAFARI_UA,
  });

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({ kind: "unsubscribed" });
});

test("times out if the service worker is not ready in 5 seconds", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  await using queryClient = queryClientResource();
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    serviceWorkerReady: new Promise<ServiceWorkerRegistration>(() => {}),
  });

  const pending = queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));
  await vi.advanceTimersByTimeAsync(5000);

  expect(await pending).toEqual({ kind: "serviceWorkerTimeout" });
});

test("treats a service worker failure as unsubscribed", async () => {
  await using queryClient = queryClientResource();
  const serviceWorkerReady = Promise.reject(new Error("service worker unavailable"));
  void serviceWorkerReady.catch(() => {});
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    serviceWorkerReady,
  });

  const capability = await queryClient.fetchQuery(browserPushQueryOptions(queryClient, babyRef));

  expect(capability).toEqual({ kind: "unsubscribed" });
});

test("keeps a stable query key scoped by baby for loader prefetch and useQuery", () => {
  const queryClient = new QueryClient();
  expect(browserPushQueryOptions(queryClient, babyRef).queryKey).toEqual([
    "browserPushCapability",
    babyRef,
  ]);
  expect(browserPushQueryOptions(queryClient, babyRef).queryKey).toEqual(
    browserPushQueryOptions(queryClient, babyRef).queryKey,
  );
});

test("prefetches capability and isSubscribed into the query cache in the browser", async () => {
  await using queryClient = queryClientResource(true);
  await using _env = stubBrowserPush({
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    // SAFETY: Test fixture is a subset of the production type.
    subscription: { endpoint: "https://push.example/sub" } as PushSubscription,
  });

  const handle = prefetchBrowserPushCapability(queryClient, babyRef);

  expect(handle).toMatchObject({ input: babyRef });
  await vi.waitFor(() => {
    expect(
      queryClient.getQueryData(browserPushQueryOptions(queryClient, babyRef).queryKey),
    ).toEqual({
      family: true,
      kind: "subscribed",
      messages: true,
      subscription: { endpoint: "https://push.example/sub" },
    });
  });
});

test("does not touch PushManager while prefetching on the server", async () => {
  await using queryClient = queryClientResource();
  const originalWindow = globalThis.window;
  vi.stubGlobal("window", undefined);
  await using _window = makeResource({}, () => {
    vi.unstubAllGlobals();
    globalThis.window = originalWindow;
  });

  const ensureSpy = vi.spyOn(queryClient, "ensureQueryData");
  const handle = prefetchBrowserPushCapability(queryClient, babyRef);

  expect(handle).toMatchObject({ input: babyRef });
  expect(ensureSpy).not.toHaveBeenCalled();
  expect(
    queryClient.getQueryData(browserPushQueryOptions(queryClient, babyRef).queryKey),
  ).toBeUndefined();
});

test("shows iOS Home Screen instructions when the PWA is not installed", async () => {
  await using view = await renderSubscribe({ kind: "needsIosInstall" }, "visitor");

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));

  expect(screen.getByText("Get Notifications on iOS")).toBeTruthy();
  expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
});

test("offers subscribe when push is supported without a subscription", async () => {
  await using view = await renderSubscribe({ kind: "unsubscribed" }, "visitor");

  expect(view.getByRole("button", { name: "Get Notifications" })).toBeTruthy();
  expect(view.queryByText("Get Notifications on iOS")).toBeNull();
});

test("offers subscribe when the service worker times out", async () => {
  await using view = await renderSubscribe({ kind: "serviceWorkerTimeout" }, "visitor");

  expect(view.getByRole("button", { name: "Get Notifications" })).toBeTruthy();
  expect(view.queryByText("Get Notifications on iOS")).toBeNull();
});

test("offers subscribe when push is unsupported", async () => {
  await using view = await renderSubscribe({ kind: "unsupported" }, "visitor");

  expect(view.getByRole("button", { name: "Get Notifications" })).toBeTruthy();
});

test("shows unsubscribe when Convex reports an active subscription", async () => {
  await using view = await renderSubscribe(
    {
      family: true,
      kind: "subscribed",
      messages: false,
      // SAFETY: Test fixture is a subset of the production type.
      subscription: { endpoint: "https://push.example/sub" } as PushSubscription,
    },
    "visitor",
  );

  expect(view.getByRole("button", { name: "Unsubscribe" })).toBeTruthy();
});

test("offers subscribe when the browser is subscribed but Convex is not", async () => {
  await using view = await renderSubscribe(
    {
      family: false,
      kind: "subscribed",
      messages: false,
      // SAFETY: Test fixture is a subset of the production type.
      subscription: { endpoint: "https://push.example/sub" } as PushSubscription,
    },
    "visitor",
  );

  expect(view.getByRole("button", { name: "Get Notifications" })).toBeTruthy();
});

test("managers still get iOS Home Screen instructions before the chooser", async () => {
  await using view = await renderSubscribe({ kind: "needsIosInstall" }, "manager");

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));

  expect(screen.getByText("Get Notifications on iOS")).toBeTruthy();
  expect(screen.queryByText("Choose notifications")).toBeNull();
  expect(screen.getByText(/does not inherit your Safari login/i)).toBeTruthy();
});

test("visitor iOS install copy does not mention signing in", async () => {
  await using view = await renderSubscribe({ kind: "needsIosInstall" }, "visitor");

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));

  expect(screen.getByText(/Come back here and tap/i)).toBeTruthy();
  expect(screen.queryByText(/does not inherit your Safari login/i)).toBeNull();
});

test("managers pick status and message alerts in a chooser", async () => {
  await using view = await renderSubscribe({ kind: "unsubscribed" }, "manager");

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));

  expect(screen.getByRole("heading", { name: "Choose notifications" })).toBeTruthy();
  expect(
    screen.getByRole("checkbox", { name: "Status updates" }).getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen.getByRole("checkbox", { name: "Message notifications" }).getAttribute("aria-checked"),
  ).toBe("true");
});

test("manager chooser defaults match the current subscription", async () => {
  await using view = await renderSubscribe(
    {
      family: true,
      kind: "subscribed",
      messages: false,
      // SAFETY: Test fixture is a subset of the production type.
      subscription: { endpoint: "https://push.example/sub" } as PushSubscription,
    },
    "manager",
  );

  fireEvent.click(view.getByRole("button", { name: "Unsubscribe" }));

  expect(
    screen.getByRole("checkbox", { name: "Status updates" }).getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen.getByRole("checkbox", { name: "Message notifications" }).getAttribute("aria-checked"),
  ).toBe("false");
});

test("saving the manager chooser reports the selected alerts", async () => {
  const onSubmit = vi
    .fn<(selection: { family: boolean; messages: boolean }) => Promise<void>>()
    .mockResolvedValue();
  await using view = await renderWithTestRouter(
    <TooltipProvider>
      <ManagerNotificationChooserView
        familyDefault={true}
        isPending={false}
        isSubscribed={false}
        messagesDefault={true}
        onSubmit={onSubmit}
      />
    </TooltipProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Message notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({ family: true, messages: false });
  });
});

test("saving both channels off reports an unsubscribe selection", async () => {
  const onSubmit = vi
    .fn<(selection: { family: boolean; messages: boolean }) => Promise<void>>()
    .mockResolvedValue();
  await using view = await renderWithTestRouter(
    <TooltipProvider>
      <ManagerNotificationChooserView
        familyDefault={true}
        isPending={false}
        isSubscribed={true}
        messagesDefault={true}
        onSubmit={onSubmit}
      />
    </TooltipProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Unsubscribe" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Status updates" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Message notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({ family: false, messages: false });
  });
});

test("chooser Save waits for the mutation before closing", async () => {
  let finishSave: (() => void) | undefined;
  const onSubmit = vi.fn<(selection: { family: boolean; messages: boolean }) => Promise<void>>(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  await using view = await renderWithTestRouter(
    <TooltipProvider>
      <ManagerNotificationChooserView
        familyDefault={true}
        isPending={false}
        isSubscribed={false}
        messagesDefault={true}
        onSubmit={onSubmit}
      />
    </TooltipProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledOnce();
  });
  expect(view.getByRole("heading", { name: "Choose notifications" })).toBeTruthy();

  finishSave?.();
  await vi.waitFor(() => {
    expect(view.queryByRole("heading", { name: "Choose notifications" })).toBeNull();
  });
});

test("dirty chooser dismiss asks to discard unsaved changes", async () => {
  const onSubmit = vi
    .fn<(selection: { family: boolean; messages: boolean }) => Promise<void>>()
    .mockResolvedValue();
  await using view = await renderWithTestRouter(
    <TooltipProvider>
      <ManagerNotificationChooserView
        familyDefault={true}
        isPending={false}
        isSubscribed={false}
        messagesDefault={true}
        onSubmit={onSubmit}
      />
    </TooltipProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Message notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Close" }));

  expect(view.getByRole("heading", { name: "Discard unsaved changes?" })).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();

  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  expect(view.getByRole("heading", { name: "Choose notifications" })).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Close" }));
  fireEvent.click(view.getByRole("button", { name: "Discard" }));

  await vi.waitFor(() => {
    expect(view.queryByRole("heading", { name: "Choose notifications" })).toBeNull();
  });
  expect(onSubmit).not.toHaveBeenCalled();
});

const OWNER_ENDPOINT = "https://push.example/owner-and-family";

function ownerPushSubscription() {
  // SAFETY: Test fixture is a subset of the production type.
  return {
    endpoint: OWNER_ENDPOINT,
    toJSON: (): PushSubscriptionJSON => ({
      endpoint: OWNER_ENDPOINT,
      keys: { auth: "auth", p256dh: "p256" },
    }),
  } as PushSubscription;
}

function stubGrantedOwnerPush() {
  const restore: Array<() => void> = [];
  const subscription = ownerPushSubscription();

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
      getSubscription: () => Promise.resolve(subscription),
      subscribe: () => Promise.resolve(subscription),
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

test("visitor Get Notifications does not drop owner message alerts", async () => {
  await using _env = stubGrantedOwnerPush();
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await harness.client.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "auth",
    babyId: baby.babyId,
    endpoint: OWNER_ENDPOINT,
    p256dh: "p256",
    userAgent: "vitest",
  });
  harness.withIdentity(null);

  const vapid = await harness.convexPreloader.ensureQueryData(
    api.pushSubscriptions.getPublicKey,
    {},
  );
  const view = await renderWithConvexTest({
    harness,
    ui: (
      <TooltipProvider>
        <NotificationSubscribe
          audience="visitor"
          babyId={baby.babyId}
          browserPush={testPreloadedQuery(
            (ref) => browserPushQueryOptions(harness.queryClient, ref),
            {
              family: false,
              kind: "subscribed",
              messages: true,
              subscription: ownerPushSubscription(),
            },
            baby.publicId,
          )}
          vapidPublicKey={vapid}
        />
      </TooltipProvider>
    ),
    wrap: null,
  });
  await using _view = makeAsyncResource(view, async () => {
    view[Symbol.dispose]();
  });

  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));

  await vi.waitFor(async () => {
    expect(
      await harness.client.query(api.pushSubscriptions.isSubscribed, {
        babyId: baby.babyId,
        endpoint: OWNER_ENDPOINT,
      }),
    ).toBe(true);
  });
  expect(
    await harness.client.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: baby.babyId,
      endpoint: OWNER_ENDPOINT,
    }),
  ).toBe(true);
});
