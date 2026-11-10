import { getData, removeAll } from "@raf-query/react";
import { fireEvent } from "@testing-library/react";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { expect, test, vi } from "vitest";
import { AccountSettingsView } from "@/components/account-settings";
import { LocaleProvider } from "@/lib/i18n";
import {
  AdminNewBabyPushSwitchView,
  DashboardSettingsSheet,
  DashboardSettingsSheetView,
  Route,
} from "./settings";
import {
  seedAdminBrowserPushCapability,
  stubPushDeviceResource,
  testPushSubscription,
} from "@/test/browserPush";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { WithOverlayControl } from "@/test/overlayControl";
import { renderMountedFileRouteWithRouterContext } from "@/test/renderMountedFileRoute";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { runRouteLoaderWithRouterContext, signedInRouteContext } from "@/test/routeTestContext";
import { loadQuery } from "@/test/loadQuery";

const vapidPublicKeyQuery = convexQuery(api.pushSubscriptions.getPublicKey);

const ADMIN_ENDPOINT = "https://push.example/alex-phone";

/** Press the modal sheet's backdrop the way a real pointer would. */
function clickSheetBackdrop(baseElement: Element) {
  const backdrop = baseElement.querySelector("[data-slot=sheet-overlay]");
  if (!backdrop) {
    throw new Error("sheet backdrop missing");
  }
  fireEvent.pointerDown(backdrop, { pointerType: "mouse" });
  fireEvent.mouseDown(backdrop);
  fireEvent.mouseUp(backdrop);
  fireEvent.click(backdrop);
}

function renderSettings(opts: {
  accountSettings: ReactNode;
  adminNotifications: ReactNode;
  isAdmin: boolean;
  languageSettings: ReactNode;
  onSignOut: () => void;
}) {
  return renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <WithOverlayControl
        onOpenChange={() => undefined}
        onOpenChangeComplete={() => undefined}
        open
      >
        {(overlay) => (
          <DashboardSettingsSheetView
            accountSettings={opts.accountSettings}
            adminNotifications={opts.adminNotifications}
            isAdmin={opts.isAdmin}
            languageSettings={opts.languageSettings}
            onSignOut={opts.onSignOut}
            overlay={overlay}
          />
        )}
      </WithOverlayControl>
    </LocaleProvider>,
    { path: "/dashboard/settings" },
  );
}

function stubAccountRows() {
  return (
    <AccountSettingsView
      onChangeEmail={vi.fn(async () => {})}
      onChangePassword={vi.fn(async () => {})}
      onUpdateName={vi.fn(async () => {})}
      user={{
        email: "ada@example.com",
        name: "Ada",
      }}
    />
  );
}

test("settings sheet previews account fields instead of linking to a profile page", async () => {
  const onSignOut = vi.fn<() => void>();
  await using view = await renderSettings({
    accountSettings: stubAccountRows(),
    adminNotifications: null,
    isAdmin: true,
    languageSettings: <div>Language and timezone controls</div>,
    onSignOut,
  });

  expect(view.getByRole("dialog")).toBeTruthy();
  expect(view.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getByText("ada@example.com")).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit name" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit email" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit password" })).toBeTruthy();
  expect(view.queryByRole("link", { name: /Profile/ })).toBeNull();
  expect(view.getByRole("heading", { name: "Account" })).toBeTruthy();
  expect(view.queryByRole("heading", { name: "Language and time zone" })).toBeNull();
  expect(view.getByText("Language and timezone controls")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Toggle theme" })).toBeNull();
  expect(view.queryByRole("heading", { name: "Appearance" })).toBeNull();
  expect(view.getByRole("link", { name: "Admin dashboard" }).getAttribute("href")).toContain(
    "/dashboard/admin",
  );
  expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
  expect(view.queryByText("Restart tour")).toBeNull();
});

test("settings sheet omits the admin link for non-admins", async () => {
  await using view = await renderSettings({
    accountSettings: stubAccountRows(),
    adminNotifications: null,
    isAdmin: false,
    languageSettings: <div>Language and timezone controls</div>,
    onSignOut: () => undefined,
  });

  expect(view.getByRole("dialog")).toBeTruthy();
  expect(view.queryByRole("link", { name: /Profile/ })).toBeNull();
  expect(view.queryByRole("link", { name: "Admin dashboard" })).toBeNull();
  expect(view.queryByRole("button", { name: "Add Baby" })).toBeNull();
  expect(view.queryByRole("heading", { name: /Your babies/ })).toBeNull();
});

test("DashboardSettingsSheet wires the preloaded profile into the view", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  await harness.withIdentity({ subject: userId });

  const profile = await loadQuery(harness.queryClient, convexQuery(api.profile.get), {});

  await using view = await renderWithConvexTest({
    harness,
    ui: (
      <DashboardSettingsSheet
        adminPush={null}
        // @ts-expect-error — integration client is not ConvexReactClient
        convexClient={harness.convexClient}
        profile={profile}
        queryClient={harness.queryClient}
      />
    ),
    wrap: null,
  });

  // Overlay opens after rAF so Base UI can play the enter transition.
  await vi.waitFor(() => {
    expect(view.getByRole("dialog")).toBeTruthy();
  });
  expect(view.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
});

test("discarding a dirty account editor from the sheet backdrop goes back to /dashboard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  await harness.withIdentity({ subject: userId });

  // Push-opened from the dashboard header, under jsdom's real window.history
  // so `back()` runs the router's navigation blockers on popstate.
  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: "/dashboard/settings",
    overlayHistory: { engine: "browser", overlayPush: true, parentEntry: "/dashboard" },
    path: "/dashboard/settings",
    route: Route,
    routerContext: await signedInRouteContext(harness),
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
    expect(ctx.view.getByRole("button", { name: "Edit name" })).toBeTruthy();
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Edit name" }));
  fireEvent.change(ctx.view.getByLabelText("Your name"), { target: { value: "Ada X" } });

  clickSheetBackdrop(ctx.view.baseElement);
  await vi.waitFor(() => {
    expect(ctx.view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(window.location.pathname).toBe("/dashboard/settings");

  fireEvent.click(ctx.view.getByRole("button", { name: "Discard" }));

  await vi.waitFor(() => {
    expect(ctx.back).toHaveBeenCalledExactlyOnceWith({ ignoreBlocker: true });
    expect(window.location.pathname).toBe("/dashboard");
    expect(ctx.router.state.location.pathname).toBe("/dashboard");
  });
  expect(ctx.view.queryByRole("dialog")).toBeNull();
});

test("settings sheet log-out button invokes the injected handler", async () => {
  const onSignOut = vi.fn<() => void>();
  await using view = await renderSettings({
    accountSettings: stubAccountRows(),
    adminNotifications: null,
    isAdmin: false,
    languageSettings: <div>Language and timezone controls</div>,
    onSignOut,
  });

  fireEvent.click(view.getByRole("button", { name: "Log out" }));
  await vi.waitFor(() => {
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

function renderAdminSwitchView(opts: {
  checked: boolean;
  disabledReason: "unsupported" | "needsIosInstall" | null;
  onCheckedChange: ((checked: boolean) => void) | null;
}) {
  return renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <AdminNewBabyPushSwitchView
        checked={opts.checked}
        disabled={opts.disabledReason !== null}
        disabledReason={opts.disabledReason}
        onCheckedChange={opts.onCheckedChange}
      />
    </LocaleProvider>,
  );
}

test("admins get a new-baby alerts switch in the Admin section", async () => {
  const onCheckedChange = vi.fn<(checked: boolean) => void>();
  await using view = await renderSettings({
    accountSettings: stubAccountRows(),
    adminNotifications: (
      <AdminNewBabyPushSwitchView
        checked={false}
        disabled={false}
        disabledReason={null}
        onCheckedChange={onCheckedChange}
      />
    ),
    isAdmin: true,
    languageSettings: <div>Language and timezone controls</div>,
    onSignOut: () => undefined,
  });

  const alerts = view.getByRole("switch", { name: "New baby alerts" });
  expect(alerts.getAttribute("aria-checked")).toBe("false");
  expect(
    view.getByText("Get a push on this device whenever someone creates a baby page."),
  ).toBeTruthy();

  fireEvent.click(alerts);
  expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
});

test("the new-baby switch says when this device is subscribed", async () => {
  await using view = await renderAdminSwitchView({
    checked: true,
    disabledReason: null,
    onCheckedChange: vi.fn(),
  });

  expect(view.getByRole("switch", { name: "New baby alerts" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(view.getByText("This device gets a push for every new baby page.")).toBeTruthy();
});

test("on iPhone Safari the new-baby switch becomes Home Screen instructions", async () => {
  await using view = await renderAdminSwitchView({
    checked: false,
    disabledReason: "needsIosInstall",
    onCheckedChange: null,
  });

  expect(view.queryByRole("switch", { name: "New baby alerts" })).toBeNull();
  expect(view.getByText(/new baby alerts need this dashboard on your Home Screen/)).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Get Notifications" }));
  expect(view.getByText("Get Notifications on iOS")).toBeTruthy();
  expect(view.getByText(/does not inherit your Safari login/i)).toBeTruthy();
});

test("the new-baby switch is disabled where the browser cannot push", async () => {
  await using view = await renderAdminSwitchView({
    checked: false,
    disabledReason: "unsupported",
    onCheckedChange: null,
  });

  expect(view.getByRole("switch", { name: "New baby alerts" }).hasAttribute("data-disabled")).toBe(
    true,
  );
  expect(view.getByText("Push notifications are not supported in this browser.")).toBeTruthy();
});

async function signedInHarness(opts: { isAdmin: boolean }) {
  const harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "alex@example.com",
    name: "Alex",
    password: "password123",
  });
  await harness.withIdentity({ subject: userId });
  await harness.client.mutation(api.profile.updateLocale, { locale: "en-GB" });
  await harness.t.run(async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    for (const profile of profiles) {
      await ctx.db.patch(profile._id, { isAdmin: opts.isAdmin });
    }
  });
  removeAll(harness.queryClient);
  return harness;
}

type SettingsLoaderData = { adminPush: { vapidPublicKey: { input: object } } | null };

async function loadSettings(harness: ConvexTestHarness) {
  return await runRouteLoaderWithRouterContext<SettingsLoaderData>({
    harness,
    location: undefined,
    params: {},
    route: Route,
    routerContext: await signedInRouteContext(harness),
  });
}

test("the settings loader only prepares admin push for admins", async () => {
  await using member = await signedInHarness({ isAdmin: false });
  expect(await loadSettings(member)).toEqual({ adminPush: null });

  await using admin = await signedInHarness({ isAdmin: true });
  const loaded = await loadSettings(admin);
  expect(loaded.adminPush?.vapidPublicKey).toMatchObject({ input: {} });
  expect(getData(admin.queryClient, vapidPublicKeyQuery, {})).toEqual(expect.any(String));
});

async function renderAdminSheet(harness: ConvexTestHarness) {
  const profile = await loadQuery(harness.queryClient, convexQuery(api.profile.get), {});
  const vapidPublicKey = await loadQuery(
    harness.queryClient,
    convexQuery(api.pushSubscriptions.getPublicKey),
    {},
  );

  seedAdminBrowserPushCapability(harness.queryClient, { kind: "unsubscribed" });
  return await renderWithConvexTest({
    harness,
    ui: (
      <>
        <DashboardSettingsSheet
          adminPush={{ vapidPublicKey }}
          // @ts-expect-error — integration client is not ConvexReactClient
          convexClient={harness.convexClient}
          profile={profile}
          queryClient={harness.queryClient}
        />
        <Toaster />
      </>
    ),
    wrap: null,
  });
}

test("an admin turning on new-baby alerts stores this device's subscription", async () => {
  await using _push = stubPushDeviceResource({
    existing: testPushSubscription(ADMIN_ENDPOINT),
    permission: "granted",
  });
  await using harness = await signedInHarness({ isAdmin: true });
  await using view = await renderAdminSheet(harness);

  const alerts = await vi.waitFor(() => view.getByRole("switch", { name: "New baby alerts" }));
  fireEvent.click(alerts);

  await vi.waitFor(async () => {
    expect(
      await harness.client.query(api.adminPushSubscriptions.isSubscribed, {
        endpoint: ADMIN_ENDPOINT,
      }),
    ).toBe(true);
    const switched = view.getByRole("switch", { name: "New baby alerts" });
    expect(switched.getAttribute("aria-checked")).toBe("true");
    expect(switched.hasAttribute("data-disabled")).toBe(false);
  });

  fireEvent.click(view.getByRole("switch", { name: "New baby alerts" }));
  await vi.waitFor(async () => {
    expect(
      await harness.client.query(api.adminPushSubscriptions.isSubscribed, {
        endpoint: ADMIN_ENDPOINT,
      }),
    ).toBe(false);
  });
});

test("new-baby alerts explain a blocked notification permission instead of subscribing", async () => {
  await using _push = stubPushDeviceResource({
    existing: testPushSubscription(ADMIN_ENDPOINT),
    permission: "denied",
  });
  await using harness = await signedInHarness({ isAdmin: true });
  await using view = await renderAdminSheet(harness);

  fireEvent.click(await vi.waitFor(() => view.getByRole("switch", { name: "New baby alerts" })));

  expect(await view.findByText("Notification permission is required")).toBeTruthy();
  expect(view.getByRole("switch", { name: "New baby alerts" }).getAttribute("aria-checked")).toBe(
    "false",
  );
  expect(
    await harness.client.query(api.adminPushSubscriptions.isSubscribed, {
      endpoint: ADMIN_ENDPOINT,
    }),
  ).toBe(false);
});
