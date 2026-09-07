import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
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

test("signing up from the overlay closes it back onto the baby page as the new user", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  harness.withIdentity(null);

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

  fireEvent.change(ctx.view.getByLabelText("Name"), { target: { value: "Grace" } });
  fireEvent.change(ctx.view.getByLabelText("Email"), {
    target: { value: "grace@example.com" },
  });
  fireEvent.change(ctx.view.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.click(ctx.view.getByRole("button", { name: /sign up/i }));

  await vi.waitFor(() => {
    expect(ctx.back).toHaveBeenCalledOnce();
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: "grace@example.com", name: "Grace" }),
  );
});
