import { fireEvent } from "@testing-library/react";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, seedTimelineUpdateWithPhoto, postTestUpdate } from "@/test/convexTestSeed";
import { renderMountedFileRoute, stubBrowserImageResource } from "@/test/renderMountedFileRoute";
import { runRouteLoader } from "@/test/routeTestContext";
import { Route } from "@/routes/baby/$publicId/updates.$updateId.photo";

test("update photo loader 404s when the update has no photo", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const updateId = await postTestUpdate(harness, {
    babyId: baby.babyId,
    message: "Text only",
  });

  await expect(
    runRouteLoader({
      harness,
      location: undefined,
      params: { publicId: baby.publicId, updateId },
      route: Route,
    }),
  ).rejects.toMatchObject({
    isNotFound: true,
  });
});

test("update photo loader prefetches the full image in the browser", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const update = await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Photo update",
  });
  const photo = await harness.client.query(api.timeline.getUpdatePhoto, {
    babyId: baby.publicId,
    updateId: update.updateId,
  });
  const photoUrl = photo?.photoUrl;
  if (!photoUrl) {
    throw new Error("expected update photo URL");
  }

  await using _image = stubBrowserImageResource();

  const data = await runRouteLoader<{ imagePrefetch: { input: string | undefined } }>({
    harness,
    location: undefined,
    params: { publicId: baby.publicId, updateId: update.updateId },
    route: Route,
  });

  expect(data.imagePrefetch).toMatchObject({ input: photoUrl });
  await vi.waitFor(() => {
    expect(harness.queryClient.getQueryData(["browserImagePrefetch", photoUrl])).toEqual({
      ok: true,
      url: photoUrl,
    });
  });
});

test("dismisses the update photo overlay after the dialog closes", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const update = await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Photo update",
  });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/updates/${update.updateId}/photo`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/updates/$updateId/photo",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByAltText("Photo of Baby Smith")).toBeTruthy();
  fireEvent.click(ctx.view.getByRole("button", { name: "Close photo" }));
  await vi.waitFor(() => {
    expect(ctx.back).toHaveBeenCalled();
  });
});

test("BabyUpdatePhotoOverlay mounts from the real route loader", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const update = await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Photo update",
  });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/updates/${update.updateId}/photo`,
    overlayHistory: null,
    path: "/baby/$publicId/updates/$updateId/photo",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByAltText("Photo of Baby Smith")).toBeTruthy();
});
