import { fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { CoParentsSettings } from "@/components/baby/co-parents-settings";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";

test("CoParentsSettings lists co-parents seeded through convex-test", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await harness.client.mutation(api.coParents.invite, {
    babyId: baby.babyId,
    email: "bob@example.com",
  });

  const listing = await harness.convexPreloader.ensureQueryData(api.coParents.listForBaby, {
    babyId: baby.babyId,
  });

  await using view = await renderWithConvexTest({
    harness,
    ui: <CoParentsSettings babyId={baby.babyId} isOwner={true} listing={listing} />,
    wrap: null,
  });

  expect(view.getByText("bob@example.com")).toBeTruthy();
});

test("owner can invite a co-parent by email through real mutations", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  const listing = await harness.convexPreloader.ensureQueryData(api.coParents.listForBaby, {
    babyId: baby.babyId,
  });

  await using view = await renderWithConvexTest({
    harness,
    ui: <CoParentsSettings babyId={baby.babyId} isOwner={true} listing={listing} />,
    wrap: null,
  });

  expect(view.getByText(/No co-parents yet/)).toBeTruthy();
  fireEvent.change(view.getByPlaceholderText("partner@example.com"), {
    target: { value: "partner@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Add" }));

  await vi.waitFor(() => {
    expect(view.getByText("partner@example.com")).toBeTruthy();
  });
});

test("owner can remove co-parents and cancel pending invites", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const aliceId = await signUpTestUser(harness, {
    email: "alice@example.com",
    name: "Alice",
    password: "password123",
  });
  await signUpTestUser(harness, {
    email: "bob@example.com",
    name: "Bob",
    password: "password123",
  });

  harness.withIdentity({ subject: aliceId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await harness.client.mutation(api.coParents.invite, {
    babyId: baby.babyId,
    email: "bob@example.com",
  });
  await harness.client.mutation(api.coParents.invite, {
    babyId: baby.babyId,
    email: "newbie@example.com",
  });

  const listing = await harness.convexPreloader.ensureQueryData(api.coParents.listForBaby, {
    babyId: baby.babyId,
  });

  await using view = await renderWithConvexTest({
    harness,
    ui: <CoParentsSettings babyId={baby.babyId} isOwner={true} listing={listing} />,
    wrap: null,
  });

  expect(view.getAllByText("Invite pending")).toHaveLength(1);
  expect(view.getByText("bob@example.com")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Remove bob@example.com" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("button", { name: "Remove bob@example.com" })).toBeNull();
  });

  fireEvent.click(view.getByRole("button", { name: "Cancel invite to newbie@example.com" }));
  await vi.waitFor(() => {
    expect(view.queryByText("Invite pending")).toBeNull();
  });
});

test("co-parents see a read-only list without invite form", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const aliceId = await signUpTestUser(harness, {
    email: "alice@example.com",
    name: "Alice",
    password: "password123",
  });
  const bobId = await signUpTestUser(harness, {
    email: "bob@example.com",
    name: "Bob",
    password: "password123",
  });

  harness.withIdentity({ subject: aliceId });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await harness.client.mutation(api.coParents.invite, {
    babyId: baby.babyId,
    email: "bob@example.com",
  });

  harness.withIdentity({ subject: bobId });
  const listing = await harness.convexPreloader.ensureQueryData(api.coParents.listForBaby, {
    babyId: baby.babyId,
  });

  await using view = await renderWithConvexTest({
    harness,
    ui: <CoParentsSettings babyId={baby.babyId} isOwner={false} listing={listing} />,
    wrap: null,
  });

  expect(view.getByText("Bob")).toBeTruthy();
  expect(view.queryByPlaceholderText("partner@example.com")).toBeNull();
  expect(view.queryByRole("button", { name: "Add" })).toBeNull();
  expect(view.queryByRole("button", { name: /^Remove / })).toBeNull();
});
