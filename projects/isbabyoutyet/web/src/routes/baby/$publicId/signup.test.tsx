import { expect, test, vi } from "vitest";
import { Route } from "@/routes/baby/$publicId/signup";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby } from "@/test/convexTestSeed";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";

test("the overlay shows the signup form on the baby page", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/signup`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/signup",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByRole("heading", { name: "Join the fun!" })).toBeTruthy();
  expect(ctx.view.getByLabelText("Name")).toBeTruthy();
  expect(ctx.view.getByLabelText("Email")).toBeTruthy();
  expect(ctx.view.getByRole("button", { name: /sign up/i })).toBeTruthy();
  expect(ctx.view.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
    `/baby/${baby.publicId}/login`,
  );
});
