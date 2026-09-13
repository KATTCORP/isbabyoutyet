import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
import { Route } from "./settings";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { promoteToAdmin, signInTestUser, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRouteWithRouterContext } from "@/test/renderMountedFileRoute";
import { untilCalled } from "@/test/untilCalled";

const ADA = { email: "ada@example.com", name: "Ada", password: "password123" };

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

/**
 * Ada is signed in the way a browser would be (session cookie + Convex
 * identity), and the settings sheet is push-opened from the dashboard header.
 */
async function openSettingsSheet(harness: ConvexTestHarness) {
  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  const ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: "/dashboard/settings",
    overlayHistory: { engine: "browser", overlayPush: true, parentEntry: "/dashboard" },
    path: "/dashboard/settings",
    route: Route,
    routerContext: { profile },
    wrap: null,
  });
  // Overlay opens after rAF so Base UI can play the enter transition.
  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  return ctx;
}

async function sessionForCookies() {
  const response = await fetch(`${import.meta.env.VITE_SITE_URL}/api/auth/get-session`);
  return { body: await response.json(), status: response.status };
}

test("settings route renders only its route-backed sheet overlay", () => {
  expect(Route.options).not.toHaveProperty("loader");
});

test("the sheet shows the signed-in account and hides admin tools from non-admins", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await signInTestUser(harness, ADA);
  await using ctx = await openSettingsSheet(harness);
  const view = ctx.view;

  expect(view.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(view.getByRole("heading", { name: "Account" })).toBeTruthy();
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getByText("ada@example.com")).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit name" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit email" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit password" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Log out" })).toBeTruthy();
  expect(view.queryByRole("link", { name: /Profile/ })).toBeNull();
  expect(view.queryByRole("link", { name: "Admin dashboard" })).toBeNull();
  expect(view.queryByRole("heading", { name: "Admin" })).toBeNull();
  expect(view.queryByRole("button", { name: "Toggle theme" })).toBeNull();
  expect(view.queryByText("Restart tour")).toBeNull();
});

test("admins get a link to the admin dashboard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, ADA);
  await promoteToAdmin(harness, userId);
  await signInTestUser(harness, ADA);
  await using ctx = await openSettingsSheet(harness);

  expect(ctx.view.getByRole("heading", { name: "Admin" })).toBeTruthy();
  expect(ctx.view.getByRole("link", { name: "Admin dashboard" }).getAttribute("href")).toContain(
    "/dashboard/admin",
  );
});

test("logging out ends the session and goes home", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await signInTestUser(harness, ADA);
  expect(await sessionForCookies()).toEqual(
    expect.objectContaining({ body: expect.objectContaining({ user: expect.anything() }) }),
  );
  await using ctx = await openSettingsSheet(harness);

  fireEvent.click(ctx.view.getByRole("button", { name: "Log out" }));

  await untilCalled(ctx.navigate);
  expect(ctx.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/" }));
  expect(await harness.client.query(api.profile.get, {})).toBeNull();
  // The browser no longer holds a session: Better Auth answers with none.
  expect(await sessionForCookies()).toEqual({ body: null, status: 200 });
});

test("discarding a dirty account editor from the sheet backdrop goes back to /dashboard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await signInTestUser(harness, ADA);
  await using ctx = await openSettingsSheet(harness);

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
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ name: "Ada" }),
  );
});
