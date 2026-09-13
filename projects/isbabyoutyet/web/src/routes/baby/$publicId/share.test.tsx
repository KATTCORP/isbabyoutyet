import { convexQuery } from "@convex-dev/react-query";
import { fireEvent } from "@testing-library/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { expect, test, vi } from "vitest";
import { getBabySeo } from "@/lib/seo";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, patchOwnedBaby } from "@/test/convexTestSeed";
import { renderMountedFileRoute, stubBrowserImageResource } from "@/test/renderMountedFileRoute";
import { runRouteLoader } from "@/test/routeTestContext";
import { Route } from "@/routes/baby/$publicId/share";

test("loader prefetches the canonical OG image in the browser", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await patchOwnedBaby(harness, {
    id: baby.babyId,
    patch: {
      theme: "baby-blue",
    },
  });
  await using _image = stubBrowserImageResource();

  const data = await runRouteLoader<{
    imagePrefetch: { input: string | undefined };
    myAccess: { initialData: { canManage: boolean } };
    shareLink: string;
  }>({
    harness,
    location: undefined,
    params: { publicId: baby.publicId },
    route: Route,
  });

  const babyDoc = await harness.client.query(api.baby.getByPublicId, { id: baby.publicId });
  if (!babyDoc) {
    throw new Error("expected baby");
  }
  const prefetchedImageUrl = new URL(data.imagePrefetch.input ?? "");
  expect(prefetchedImageUrl.pathname).toMatch(
    new RegExp(`^/og/baby/${baby.publicId}-${babyDoc.ogImageHash}-\\d{8}$`),
  );
  expect(prefetchedImageUrl.search).toBe("");
  expect(data.imagePrefetch.input).toBe(getBabySeo(babyDoc, baby.publicId).imageUrl);
  expect(data.myAccess.initialData.canManage).toBe(true);
  expect(data.shareLink).toBe(`https://isbabyoutyet.com/baby/${baby.publicId}`);
});

test("loader reuses a cached baby snapshot instead of refetching", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await patchOwnedBaby(harness, {
    id: baby.babyId,
    patch: {
      theme: "orange",
    },
  });
  const cachedBaby = await harness.client.query(api.baby.getByPublicId, { id: baby.publicId });
  if (!cachedBaby) {
    throw new Error("expected baby");
  }
  harness.queryClient.setQueryData(
    convexQuery(api.baby.getByPublicId, { id: baby.publicId }).queryKey,
    cachedBaby,
  );

  await patchOwnedBaby(harness, {
    id: baby.babyId,
    patch: {
      theme: "baby-blue",
    },
  });
  await using _image = stubBrowserImageResource();

  const data = await runRouteLoader<{ imagePrefetch: { input: string | undefined } }>({
    harness,
    location: undefined,
    params: { publicId: baby.publicId },
    route: Route,
  });

  const freshBaby = await harness.client.query(api.baby.getByPublicId, { id: baby.publicId });
  if (!freshBaby) {
    throw new Error("expected baby");
  }
  expect(data.imagePrefetch.input).toBe(getBabySeo(cachedBaby, baby.publicId).imageUrl);
  expect(freshBaby.theme).toBe("baby-blue");
});

test("copies from the route overlay and dismisses through overlay history", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await patchOwnedBaby(harness, {
    id: baby.babyId,
    patch: {
      theme: "baby-blue",
    },
  });
  const babyDoc = await harness.client.query(api.baby.getByPublicId, { id: baby.publicId });
  if (!babyDoc) {
    throw new Error("expected baby");
  }
  const preview = getBabySeo(babyDoc, baby.publicId);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  await using _clipboard = makeResource({}, () => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/share`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/share",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  const image = ctx.view.getByRole("img", { name: preview.title });
  expect(image.getAttribute("src")).toBe(preview.imageUrl);
  fireEvent.click(ctx.view.getByRole("button", { name: "Copy link to share" }));
  await vi.waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(`https://isbabyoutyet.com/baby/${baby.publicId}`);
    expect(ctx.view.getByRole("button", { name: "Copied!" })).toBeTruthy();
  });
  await vi.waitFor(async () => {
    const progress = await harness.client.query(api.onboarding.getMine, {});
    expect(progress.completedSteps).toContain("share_link");
  });

  fireEvent.click(ctx.view.getByRole("button", { name: "Close" }));
  await vi.waitFor(() => {
    expect(ctx.back).toHaveBeenCalledOnce();
  });
});

test("BabyShareOverlay mounts from the real route loader", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await patchOwnedBaby(harness, {
    id: baby.babyId,
    patch: {
      theme: "baby-blue",
    },
  });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/share`,
    overlayHistory: null,
    path: "/baby/$publicId/share",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByRole("heading", { name: "Share the Link" })).toBeTruthy();
});

test("share overlay falls back to execCommand when clipboard.writeText fails", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await patchOwnedBaby(harness, {
    id: baby.babyId,
    patch: {
      theme: "baby-blue",
    },
  });
  const writeText = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("denied"));
  const execCommand = vi.fn<() => boolean>().mockReturnValue(true);
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  await using _clipboard = makeResource({}, () => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const hadExecCommand = "execCommand" in document;
  const originalExecCommand = document.execCommand;
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
    writable: true,
  });
  await using _exec = makeResource({}, () => {
    if (hadExecCommand) {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
        writable: true,
      });
      return;
    }
    Reflect.deleteProperty(document, "execCommand");
  });
  await using _image = stubBrowserImageResource();

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/share`,
    overlayHistory: { engine: "memory", overlayPush: false, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/share",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Copy link to share" }));
  await vi.waitFor(() => {
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(ctx.view.getByRole("button", { name: "Copied!" })).toBeTruthy();
  });
});
