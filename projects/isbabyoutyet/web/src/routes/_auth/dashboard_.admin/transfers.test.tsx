import { fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, signUpTestUser } from "@/test/convexTestSeed";
import { renderMountedFileRouteWithRouterContext } from "@/test/renderMountedFileRoute";
import { signedInRouteContext } from "@/test/routeTestContext";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import {
  PermalinkTransfersSection,
  Route as AdminTransfersRoute,
  TransferPublicIdForm,
} from "@/routes/_auth/dashboard_.admin/transfers";

function renderAdmin(ui: ReactElement) {
  return renderWithTestRouter(<LocaleProvider locale="en-GB">{ui}</LocaleProvider>, {
    path: "/dashboard/admin/transfers",
  });
}

test("permalink transfers section shows empty and audit rows", async () => {
  await using empty = await renderAdmin(
    <PermalinkTransfersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      transfers={[]}
    />,
  );
  expect(empty.getByText("No permalink transfers yet")).toBeTruthy();

  await using filled = await renderAdmin(
    <PermalinkTransfersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      transfers={[
        {
          _id: "xfer-1",
          actorEmail: "staff@example.com",
          actorUserId: "user-staff",
          babyName: "Baby",
          createdAt: Date.UTC(2026, 8, 3, 12, 0),
          displacedPublicId: "baby-3",
          fromPublicId: "baby-2",
          motivation: "Give the real page the canonical slug",
          toPublicId: "baby",
        },
        {
          _id: "xfer-2",
          actorEmail: null,
          actorUserId: "user-2",
          babyName: "River",
          createdAt: Date.UTC(2026, 8, 2, 12, 0),
          displacedPublicId: null,
          fromPublicId: "river-1",
          motivation: "Shorter URL",
          toPublicId: "river",
        },
      ]}
    />,
  );
  expect(filled.getByText("baby-2")).toBeTruthy();
  expect(filled.getByText("Baby")).toBeTruthy();
  expect(filled.getByText("baby")).toBeTruthy();
  expect(filled.getByText("baby-3")).toBeTruthy();
  expect(filled.getByText("staff@example.com")).toBeTruthy();
  expect(filled.getByText("Give the real page the canonical slug")).toBeTruthy();
  expect(filled.getByText("user-2")).toBeTruthy();
  expect(filled.getByText("Shorter URL")).toBeTruthy();
});

test("transfer permalink form submits current slug, new slug, and motivation", async () => {
  const onTransfer = vi.fn().mockResolvedValue(undefined);
  await using view = await renderAdmin(<TransferPublicIdForm onTransfer={onTransfer} />);

  fireEvent.change(view.getByLabelText("Current permalink"), { target: { value: "baby-2" } });
  fireEvent.change(view.getByLabelText("New permalink"), { target: { value: "baby" } });
  fireEvent.change(view.getByLabelText("Motivation"), {
    target: { value: "Give the real page the canonical slug" },
  });
  fireEvent.click(view.getByRole("button", { name: "Transfer" }));

  await vi.waitFor(() => {
    expect(onTransfer).toHaveBeenCalledWith({
      fromPublicId: "baby-2",
      motivation: "Give the real page the canonical slug",
      toPublicId: "baby",
    });
  });
});

test("transfers route loads the form and audit table from Convex", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const staffId = await signUpTestUser(harness, {
    email: "staff@example.com",
    name: "Staff",
    password: "password123",
  });
  await harness.withIdentity({ subject: staffId });
  await harness.client.mutation(api.profile.updateLocale, { locale: "en-GB" });
  await harness.t.run(async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    for (const profile of profiles) {
      await ctx.db.patch(profile._id, { isAdmin: true });
    }
  });

  const bobId = await signUpTestUser(harness, {
    email: "bob@example.com",
    name: "Bob",
    password: "password123",
  });
  await harness.withIdentity({ subject: bobId });
  const claimant = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Real Baby" });
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(claimant.babyId, { publicId: "baby-2" });
  });

  await harness.withIdentity({ subject: staffId });
  harness.queryClient.clear();
  await harness.client.mutation(api.admin.transferPublicId, {
    fromPublicId: "baby-2",
    motivation: "Give the real page the canonical slug",
    toPublicId: "baby",
  });

  await using ctx = await renderMountedFileRouteWithRouterContext({
    harness,
    initialEntry: "/dashboard/admin/transfers",
    overlayHistory: null,
    path: "/dashboard/admin/transfers",
    route: AdminTransfersRoute,
    routerContext: await signedInRouteContext(harness),
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByLabelText("Current permalink")).toBeTruthy();
    expect(ctx.view.getByText("Give the real page the canonical slug")).toBeTruthy();
  });
  expect(ctx.view.getByText("baby-2")).toBeTruthy();
  expect(ctx.view.getByText("baby")).toBeTruthy();
});
