import { fireEvent } from "@testing-library/react";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedBabyWithPhoto, seedOwnedBaby } from "@/test/convexTestSeed";
import { renderMountedFileRoute, stubBrowserImageResource } from "@/test/renderMountedFileRoute";
import { runRouteLoader } from "@/test/routeTestContext";
import { Route } from "@/routes/baby/$publicId/photo";

test("loader 404s when the baby has no page photo", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await expect(
    runRouteLoader({
      harness,
      location: undefined,
      params: { publicId: baby.publicId },
      route: Route,
    }),
  ).rejects.toMatchObject({
    isNotFound: true,
  });
});

test("loader prefetches the full image in the browser", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedBabyWithPhoto(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const publicBaby = await harness.client.query(api.baby.getByPublicId, { id: baby.publicId });
  const photoUrl = publicBaby?.photoUrl;
  if (!photoUrl) {
    throw new Error("expected seeded baby photo URL");
  }

  await using _image = stubBrowserImageResource();

  const data = await runRouteLoader<{ imagePrefetch: { input: string | undefined } }>({
    harness,
    location: undefined,
    params: { publicId: baby.publicId },
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

test("dismisses the lightbox overlay after the dialog closes", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedBabyWithPhoto(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/photo`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/photo",
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

test("BabyPhotoOverlay mounts from the real route loader", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedBabyWithPhoto(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/photo`,
    overlayHistory: null,
    path: "/baby/$publicId/photo",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByAltText("Photo of Baby Smith")).toBeTruthy();
});
