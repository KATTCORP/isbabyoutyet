import { fireEvent } from "@testing-library/react";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { runRouteLoader } from "@/test/routeTestContext";
import { Route } from "@/routes/baby/$publicId/_auth/post";

test("post loader fetches manager access data", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  const result = await runRouteLoader<{
    managerBaby: { initialData: { name: string }; input: { babyId: string } };
  }>({
    harness,
    location: { pathname: `/baby/${baby.publicId}/post` },
    params: { publicId: baby.publicId },
    route: Route,
  });

  expect(result.managerBaby).toMatchObject({
    initialData: { name: "Baby Smith" },
    input: { babyId: baby.publicId },
  });
});

test("post overlay closes to the baby page after dismiss", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/post",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
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

test("post overlay asks to discard a dirty composer before closing", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/post",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.change(ctx.view.getByPlaceholderText("Write a note (optional)"), {
    target: { value: "Draft update" },
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Close" }));

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(ctx.navigate).not.toHaveBeenCalled();

  fireEvent.click(ctx.view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(ctx.view.queryByRole("alertdialog")).toBeNull();
  });
  expect(ctx.view.getByPlaceholderText("Write a note (optional)")).toBeTruthy();

  fireEvent.click(ctx.view.getByRole("button", { name: "Close" }));
  fireEvent.click(ctx.view.getByRole("button", { name: "Discard" }));

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

test("discard prompt blocks interaction with the post composer behind it", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/post",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.change(ctx.view.getByPlaceholderText("Write a note (optional)"), {
    target: { value: "Draft update" },
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Close" }));

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(ctx.back).not.toHaveBeenCalled();
  expect(ctx.navigate).not.toHaveBeenCalled();
  // Nested alert dialogs skip their backdrop unless forceRender is set.
  expect(ctx.view.baseElement.querySelector('[data-slot="alert-dialog-overlay"]')).toBeTruthy();
});

test("post overlay prefers history.back when opened via push", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/post",
    route: Route,
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

test("BabyPostUpdateOverlay mounts from the real route loader", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: null,
    path: "/baby/$publicId/post",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getAllByText("Post an update").length).toBeGreaterThan(0);
});

test("signed-in visitors without manager access see the forbidden dialog", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const visitorId = await signUpTestUser(harness, {
    email: "visitor@example.com",
    name: "Visitor",
    password: "password123",
  });
  harness.withIdentity({ subject: visitorId });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/post",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByText("403")).toBeTruthy();
  expect(ctx.view.getByRole("heading", { name: "You can't manage this page" })).toBeTruthy();
  expect(
    ctx.view.getByText("You're signed in, but you don't have access to manage this baby."),
  ).toBeTruthy();
  expect(ctx.view.queryByPlaceholderText("Write a note (optional)")).toBeNull();

  const gotIt = ctx.view.getByRole("link", { name: "Got it" });
  expect(gotIt.getAttribute("href")).toBe(`/baby/${baby.publicId}`);
  fireEvent.click(gotIt);
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

test("successful post completes onboarding step", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  harness.withIdentity({ subject: ownerId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/post`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/post",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.change(ctx.view.getByPlaceholderText("Write a note (optional)"), {
    target: { value: "First update!" },
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Post update" }));

  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.completedSteps).toContain("post_update");
  });
});
