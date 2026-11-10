import { getData } from "@raf-query/react";
import { fireEvent } from "@testing-library/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { FORBIDDEN } from "@isbabyoutyet/backend/src/types";
import { expect, test, vi } from "vitest";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRouteWithRouterContext } from "@/test/renderMountedFileRoute";
import { runRouteLoaderWithRouterContext, signedInRouteContext } from "@/test/routeTestContext";
import { convexQuery } from "@workspace/convex-query";
import { managerDocToBabyData } from "@/routes/baby/$publicId/route";
import { Route } from "@/routes/baby/$publicId/_auth/settings";
import { htmlButton } from "@/test/htmlElement";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";

test("settings loader fetches only manager settings data", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  const result = await runRouteLoaderWithRouterContext<{
    coParentsList: { input: { babyId: string } };
    managerBaby: { input: { babyId: string } };
    profile: { input: Record<string, never> };
    vapidPublicKey: { input: Record<string, never> };
  }>({
    harness,
    location: { pathname: `/baby/${baby.publicId}/settings` },
    params: { publicId: baby.publicId },
    route: Route,
    routerContext: { me: (await signedInRouteContext(harness)).me },
  });

  const babyArgs = { babyId: baby.publicId };
  expect(result.managerBaby).toMatchObject({ input: babyArgs });
  expect(result.coParentsList).toMatchObject({ input: babyArgs });
  expect(result.profile).toMatchObject({ input: {} });
  expect(result.vapidPublicKey).toMatchObject({ input: {} });
  const queryClient = harness.queryClient;
  expect(getData(queryClient, convexQuery(api.baby.getManagerBaby), babyArgs)).toMatchObject({
    name: "Baby Smith",
  });
  expect(getData(queryClient, convexQuery(api.coParents.listForBaby), babyArgs)).toEqual({
    coParents: [],
    invites: [],
  });
  expect(getData(queryClient, convexQuery(api.profile.get), {})?.locale).toBeTruthy();
  expect(getData(queryClient, convexQuery(api.pushSubscriptions.getPublicKey), {})).toBeTruthy();
  // This device's push state (`ssr: false`): the loader returns its handle.
  expect(result).toHaveProperty("browserPush");
  await vi.waitFor(() => {
    expect(getData(queryClient, browserPushCapabilityQuery, baby.publicId)).toBeDefined();
  });
});

test("managerDocToBabyData maps manager fields for the settings panel", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const managerDoc = await harness.client.query(api.baby.getManagerBaby, { babyId: baby.publicId });
  if (managerDoc === FORBIDDEN) {
    throw new Error("expected manager baby");
  }

  expect(managerDocToBabyData(managerDoc)).toMatchObject({
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    locale: null,
    name: "Baby Smith",
    publicDueDateText: null,
    theme: null,
  });
});

test("settings overlay closes to the baby page after the dialog exit animation", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: `/baby/${baby.publicId}/settings`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/settings",
    route: Route,
    routerContext: { me: (await signedInRouteContext(harness)).me },
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByRole("heading", { name: "Notifications" })).toBeTruthy();
  expect(ctx.view.getByRole("switch", { name: "Message notifications" })).toBeTruthy();
  fireEvent.click(ctx.view.getByRole("button", { name: "Close" }));

  expect(ctx.back).not.toHaveBeenCalled();
  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith({
      ignoreBlocker: true,
      params: { publicId: baby.publicId },
      replace: true,
      resetScroll: false,
      to: "/baby/$publicId",
    });
  });
  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe(`/baby/${baby.publicId}`);
  });
});

test("settings overlay prefers history.back when opened via push", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: `/baby/${baby.publicId}/settings`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/settings",
    route: Route,
    routerContext: { me: (await signedInRouteContext(harness)).me },
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Close" }));

  await vi.waitFor(() => {
    expect(ctx.back).toHaveBeenCalledOnce();
  });
  expect(ctx.navigate).not.toHaveBeenCalled();
});

test("settings overlay persists baby name edits through Convex", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  await harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: `/baby/${baby.publicId}/settings`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/settings",
    route: Route,
    routerContext: { me: (await signedInRouteContext(harness)).me },
    wrap: null,
  });
  const invalidate = vi.spyOn(ctx.router, "invalidate");

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.click(htmlButton(ctx.view.getAllByRole("button", { name: "Edit" })[0]));
  fireEvent.change(ctx.view.getByLabelText("Baby name"), { target: { value: "Nova Rae" } });
  fireEvent.click(ctx.view.getByRole("button", { name: "Save" }));

  await vi.waitFor(async () => {
    const managerDoc = await harness.client.query(api.baby.getManagerBaby, {
      babyId: baby.publicId,
    });
    if (managerDoc === FORBIDDEN) {
      throw new Error("expected manager baby");
    }
    expect(managerDoc.name).toBe("Nova Rae");
  });
  expect(invalidate).toHaveBeenCalled();
});

test("settings overlay hides delete for co-parents", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  await harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const bobId = await signUpTestUser(harness, {
    email: "bob@example.com",
    name: "Bob",
    password: "password123",
  });
  await harness.client.mutation(api.coParents.invite, {
    babyId: baby.babyId,
    email: "bob@example.com",
  });
  await harness.withIdentity({ subject: bobId });

  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: `/baby/${baby.publicId}/settings`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/settings",
    route: Route,
    routerContext: { me: (await signedInRouteContext(harness)).me },
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.queryByText("Delete page")).toBeNull();
});

test("BabySettingsOverlay mounts from the real route loader", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: `/baby/${baby.publicId}/settings`,
    overlayHistory: null,
    path: "/baby/$publicId/settings",
    route: Route,
    routerContext: { me: (await signedInRouteContext(harness)).me },
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByRole("heading", { name: "Settings" })).toBeTruthy();
});
