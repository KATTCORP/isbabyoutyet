import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
import { Route } from "@/routes/baby/$publicId/login";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { untilCalled } from "@/test/untilCalled";

const ADA = { email: "ada@example.com", name: "Ada", password: "correct-horse" };

test("the overlay shows the login form on the baby page", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/login`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/login",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByRole("heading", { name: "Welcome back!" })).toBeTruthy();
  expect(ctx.view.getByLabelText("Email")).toBeTruthy();
  expect(ctx.view.getByRole("button", { name: /sign in/i })).toBeTruthy();
  expect(ctx.view.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe(
    `/baby/${baby.publicId}/signup`,
  );
});

test("signing in from the overlay closes it back onto the baby page as that user", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await signUpTestUser(harness, ADA);
  harness.withIdentity(null);

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/login`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/login",
    route: Route,
    wrap: null,
  });
  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.change(ctx.view.getByLabelText("Email"), { target: { value: ADA.email } });
  fireEvent.change(ctx.view.getByLabelText("Password"), { target: { value: ADA.password } });
  fireEvent.click(ctx.view.getByRole("button", { name: /sign in/i }));

  await untilCalled(ctx.back);
  expect(ctx.back).toHaveBeenCalledOnce();
  expect(ctx.navigate).not.toHaveBeenCalled();
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: ADA.email }),
  );
});

test("signing in from the overlay follows a manager overlay's return path", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await signUpTestUser(harness, ADA);
  harness.withIdentity(null);

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/login?redirect=/baby/${baby.publicId}/settings`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/login",
    route: Route,
    wrap: null,
  });
  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.change(ctx.view.getByLabelText("Email"), { target: { value: ADA.email } });
  fireEvent.change(ctx.view.getByLabelText("Password"), { target: { value: ADA.password } });
  fireEvent.click(ctx.view.getByRole("button", { name: /sign in/i }));

  await untilCalled(ctx.navigate);
  expect(ctx.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ href: `/baby/${baby.publicId}/settings` }),
  );
  expect(ctx.back).not.toHaveBeenCalled();
});

test("the overlay still opens when a manager overlay left a return path", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}/login?redirect=/baby/${baby.publicId}/settings`,
    overlayHistory: { engine: "memory", overlayPush: true, parentEntry: `/baby/${baby.publicId}` },
    path: "/baby/$publicId/login",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });
  expect(ctx.view.getByRole("heading", { name: "Welcome back!" })).toBeTruthy();
});
