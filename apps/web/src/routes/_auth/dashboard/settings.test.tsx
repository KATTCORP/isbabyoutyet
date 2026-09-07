import { fireEvent } from "@testing-library/react";
import { api } from "@workspace/convex/convex/_generated/api";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { AccountSettingsView } from "@/components/account-settings";
import { LocaleProvider } from "@/lib/i18n";
import {
  DashboardSettingsRoute,
  DashboardSettingsSheet,
  DashboardSettingsSheetView,
  Route,
} from "./settings";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { WithOverlayControl } from "@/test/overlayControl";
import { renderMountedFileRouteWithRouterContext } from "@/test/renderMountedFileRoute";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";

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

test("settings route renders only its route-backed sheet overlay", () => {
  expect(Route.options).not.toHaveProperty("loader");
  expect(Route.options.component).toBe(DashboardSettingsRoute);
});

test("settings sheet omits the admin link for non-admins", async () => {
  await using view = await renderSettings({
    accountSettings: stubAccountRows(),
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
  harness.withIdentity({ subject: userId });

  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});

  await using view = await renderWithConvexTest({
    harness,
    ui: (
      <DashboardSettingsSheet
        // @ts-expect-error — integration client is not ConvexReactClient
        convexClient={harness.convexClient}
        convexQueryClient={harness.convexQueryClient}
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
  harness.withIdentity({ subject: userId });
  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});

  // Push-opened from the dashboard header, under jsdom's real window.history
  // so `back()` runs the router's navigation blockers on popstate.
  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: "/dashboard/settings",
    overlayHistory: { engine: "browser", overlayPush: true, parentEntry: "/dashboard" },
    path: "/dashboard/settings",
    route: Route,
    routerContext: { profile },
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
    isAdmin: false,
    languageSettings: <div>Language and timezone controls</div>,
    onSignOut,
  });

  fireEvent.click(view.getByRole("button", { name: "Log out" }));
  await vi.waitFor(() => {
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
