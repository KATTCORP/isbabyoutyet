import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { DEMO_EMPTY_USER, DEMO_USER, HOMEPAGE_DEMO_OWNER_USER_ID } from "../src/seedCredentials";
import { modules, registerComponents, createBabyArgs } from "./test.setup";
import { parseAuthUserPage } from "./admin";

const FIRST_PAGE = { cursor: null, numItems: 20 };

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

test("Better Auth user pagination validates adapter output", () => {
  expect(
    parseAuthUserPage({
      continueCursor: "cursor",
      isDone: true,
      page: [{ _id: "user-1", email: "user@example.com" }],
    }),
  ).toEqual({
    continueCursor: "cursor",
    isDone: true,
    page: [{ _id: "user-1", email: "user@example.com" }],
  });

  for (const invalid of [
    null,
    "not an object",
    {},
    { continueCursor: "cursor", isDone: true, page: [null] },
    { continueCursor: "cursor", isDone: "yes", page: [] },
    { continueCursor: null, isDone: true, page: [] },
  ]) {
    expect(() => parseAuthUserPage(invalid)).toThrow(/invalid user (page|pagination)/);
  }
});

test("admin queries refuse non-admins and anonymous callers", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.profile.updateLocale, { locale: "en-GB" });

  await expect(
    asAlice.query(api.admin.listBabies, {
      hideDemo: true,
      paginationOpts: FIRST_PAGE,
      sortBy: "created",
      sortOrder: "desc",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(asAlice.query(api.admin.listUsers, { paginationOpts: FIRST_PAGE })).rejects.toThrow(
    "Not authorized",
  );
  await expect(
    asAlice.query(api.admin.listPublicIdTransfers, { paginationOpts: FIRST_PAGE }),
  ).rejects.toThrow("Not authorized");
  await expect(
    asAlice.mutation(api.admin.transferPublicId, {
      fromPublicId: "baby-2",
      motivation: "Give the real page the canonical slug",
      toPublicId: "baby",
    }),
  ).rejects.toThrow("Not authorized");
  await expect(t.query(api.admin.listUsers, { paginationOpts: FIRST_PAGE })).rejects.toThrow(
    "Not authenticated",
  );
  await expect(
    t.query(api.admin.listPublicIdTransfers, { paginationOpts: FIRST_PAGE }),
  ).rejects.toThrow("Not authenticated");
});

test("seedDemoData marks the demo user as admin", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });

  expect(await asDemo.query(api.profile.get, {})).toMatchObject({
    isAdmin: true,
    locale: "en-GB",
  });

  await t.mutation(internal.seed.seedDemoData, {});
  expect(await asDemo.query(api.profile.get, {})).toMatchObject({ isAdmin: true });

  const sameSubjectFromAnotherIssuer = t.withIdentity({
    issuer: "https://other-issuer.test",
    subject: seeded.userId,
  });
  await expect(
    sameSubjectFromAnotherIssuer.query(api.admin.listUsers, {
      paginationOpts: FIRST_PAGE,
    }),
  ).rejects.toThrow("Not authorized");
});

test("admins can list babies sorted by created or updated with manager emails", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });

  const waiting = await t.run(async (ctx) => {
    return await ctx.db
      .query("baby")
      .withIndex("by_publicId", (q) => q.eq("publicId", "baby-waiting"))
      .unique();
  });
  if (!waiting) {
    throw new Error("missing waiting baby");
  }

  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("babyCoParents", {
      addedAt: Date.now(),
      addedByUserId: seeded.userId,
      babyId: waiting._id,
      email: "coparent@example.com",
      name: "Co",
      tokenIdentifier: "https://convex.test|co-parent-user",
      userId: "co-parent-user",
    });
    await ctx.db.insert("babyCoParents", {
      addedAt: Date.now(),
      addedByUserId: seeded.userId,
      babyId: waiting._id,
      deletedAt: Date.now(),
      email: "gone@example.com",
      name: "Gone",
      tokenIdentifier: "https://convex.test|gone-user",
      userId: "gone-user",
    });
    await ctx.db.insert("babyCoParents", {
      addedAt: Date.now(),
      addedByUserId: seeded.userId,
      babyId: waiting._id,
      email: DEMO_USER.email,
      name: "Dup",
      tokenIdentifier: "https://convex.test|dup-owner",
      userId: "dup-owner",
    });
    await ctx.db.insert("baby", {
      birthJourney: "labor",
      deletedAt: Date.now(),
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: now,
      name: "Deleted",
      ownerTokenIdentifier: "https://convex.test|unknown-owner",
      publicDueDateText: null,
      publicId: "baby-deleted",
      subscriptionCount: 0,
      userId: "unknown-owner",
    });
    await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "message",
      lastActivityAt: now,
      name: "Quiet",
      ownerTokenIdentifier: "https://convex.test|unknown-owner",
      publicDueDateText: "Any day now",
      publicId: "baby-quiet",
      subscriptionCount: 0,
      userId: "unknown-owner",
    });
    await ctx.db.insert("baby", {
      birthJourney: "labor",
      demo: true,
      dueDate: "2026-08-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: now,
      name: "Juniper Hale",
      ownerTokenIdentifier: `https://convex.test|${HOMEPAGE_DEMO_OWNER_USER_ID}`,
      publicDueDateText: null,
      publicId: "juniper-hale",
      subscriptionCount: 0,
      userId: HOMEPAGE_DEMO_OWNER_USER_ID,
    });
  });

  const byCreated = await asDemo.query(api.admin.listBabies, {
    hideDemo: false,
    paginationOpts: FIRST_PAGE,
    sortBy: "created",
    sortOrder: "desc",
  });
  expect(byCreated.page.some((row) => row.publicId === "baby-deleted")).toBe(false);
  expect(byCreated.page.some((row) => row.publicId === "baby-quiet")).toBe(true);
  const juniper = byCreated.page.find((row) => row.publicId === "juniper-hale");
  expect(juniper).toMatchObject({ demo: true, managerEmails: [] });
  for (let i = 1; i < byCreated.page.length; i++) {
    expect(byCreated.page[i - 1]!.createdAt).toBeGreaterThanOrEqual(byCreated.page[i]!.createdAt);
  }

  const hiddenDemos = await asDemo.query(api.admin.listBabies, {
    hideDemo: true,
    paginationOpts: FIRST_PAGE,
    sortBy: "created",
    sortOrder: "desc",
  });
  expect(hiddenDemos.page.every((row) => row.demo === false)).toBe(true);
  expect(hiddenDemos.page.some((row) => row.publicId === "juniper-hale")).toBe(false);
  expect(hiddenDemos.page.some((row) => row.publicId === "baby-quiet")).toBe(true);

  const byCreatedAsc = await asDemo.query(api.admin.listBabies, {
    hideDemo: false,
    paginationOpts: FIRST_PAGE,
    sortBy: "created",
    sortOrder: "asc",
  });
  expect(byCreatedAsc.page.map((row) => row._id)).toEqual(
    [...byCreated.page].toReversed().map((row) => row._id),
  );

  const waitingRow = byCreated.page.find((row) => row.publicId === "baby-waiting");
  expect(waitingRow?.managerEmails).toEqual([DEMO_USER.email, "coparent@example.com"]);
  expect(waitingRow?.demo).toBe(true);

  const quiet = byCreated.page.find((row) => row.publicId === "baby-quiet");
  expect(quiet?.updatedAt).toBe(quiet?.createdAt);
  expect(quiet?.managerEmails).toEqual([]);
  expect(quiet).toMatchObject({
    dueDate: "2026-12-01",
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
  const byUpdated = await asDemo.query(api.admin.listBabies, {
    hideDemo: false,
    paginationOpts: FIRST_PAGE,
    sortBy: "updated",
    sortOrder: "desc",
  });
  expect(byUpdated.page.length).toBe(byCreated.page.length);
  for (let i = 1; i < byUpdated.page.length; i++) {
    expect(byUpdated.page[i - 1]!.updatedAt).toBeGreaterThanOrEqual(byUpdated.page[i]!.updatedAt);
  }

  // Tiny pages prove continueCursor pagination works.
  const page1 = await asDemo.query(api.admin.listBabies, {
    hideDemo: false,
    paginationOpts: { cursor: null, numItems: 2 },
    sortBy: "created",
    sortOrder: "desc",
  });
  expect(page1.page).toHaveLength(2);
  expect(page1.isDone).toBe(false);
  const page2 = await asDemo.query(api.admin.listBabies, {
    hideDemo: false,
    paginationOpts: { cursor: page1.continueCursor, numItems: 2 },
    sortBy: "created",
    sortOrder: "desc",
  });
  expect(page2.page.length).toBeGreaterThan(0);
  expect(page2.page[0]!._id).not.toBe(page1.page[0]!._id);

  await expect(
    asDemo.query(api.admin.listBabies, {
      hideDemo: false,
      paginationOpts: { cursor: "nope", numItems: 2 },
      sortBy: "created",
      sortOrder: "desc",
    }),
  ).rejects.toThrow(/not valid JSON/i);

  const authUser = await t.query(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: DEMO_USER.email }],
  });
  expect(authUser).toBeTruthy();
});

test("admins can list recently signed up users newest first", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });
  await t.run(async (ctx) => {
    await ctx.db.insert("baby", {
      birthJourney: "labor",
      deletedAt: Date.now(),
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: Date.now(),
      name: "Deleted owned baby",
      ownerTokenIdentifier: `https://convex.test|${seeded.userId}`,
      publicDueDateText: null,
      publicId: "deleted-owned-baby",
      subscriptionCount: 0,
      userId: seeded.userId,
    });
  });

  const users = await asDemo.query(api.admin.listUsers, {
    paginationOpts: FIRST_PAGE,
  });
  expect(users.page.length).toBeGreaterThanOrEqual(2);
  expect(users.page.some((row) => row.email === DEMO_USER.email)).toBe(true);
  const demoParent = users.page.find((row) => row.email === DEMO_USER.email);
  expect(demoParent?.babies.length).toBeGreaterThanOrEqual(4);
  expect(demoParent?.babies.some((baby) => baby.publicId === "baby-waiting")).toBe(true);
  expect(demoParent?.babies.some((baby) => baby.publicId === "deleted-owned-baby")).toBe(false);
  const newParent = users.page.find((row) => row.email === DEMO_EMPTY_USER.email);
  expect(newParent?.babies).toEqual([]);
  for (const row of users.page) {
    expect(row.name.length).toBeGreaterThan(0);
    expect(row.email).toContain("@");
  }
  for (let i = 1; i < users.page.length; i++) {
    expect(users.page[i - 1]!.createdAt).toBeGreaterThanOrEqual(users.page[i]!.createdAt);
  }

  const page1 = await asDemo.query(api.admin.listUsers, {
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(page1.page).toHaveLength(1);
  expect(page1.isDone).toBe(false);
  const page2 = await asDemo.query(api.admin.listUsers, {
    paginationOpts: { cursor: page1.continueCursor, numItems: 1 },
  });
  expect(page2.page).toHaveLength(1);
  expect(page2.page[0]!._id).not.toBe(page1.page[0]!._id);
});

test("admins can transfer a permalink and keep the old slug as a redirect", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });
  const asCarol = t.withIdentity({ subject: "carol" });

  const occupant = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Baby" }),
  );
  await asBob.mutation(api.baby.create, createBabyArgs({ dueDate: "2026-09-01", name: "Baby" }));
  const claimant = await asCarol.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Baby" }),
  );
  expect(occupant.publicId).toBe("baby");
  expect(claimant.publicId).toBe("baby-2");

  const result = await asDemo.mutation(api.admin.transferPublicId, {
    fromPublicId: "baby-2",
    motivation: "Give the real page the canonical slug",
    toPublicId: "baby",
  });
  expect(result).toEqual({
    displacedPublicId: "baby-3",
    fromPublicId: "baby-2",
    toPublicId: "baby",
  });

  expect(await t.query(api.baby.getByPublicId, { id: "baby" })).toMatchObject({
    _id: claimant.babyId,
    publicId: "baby",
  });
  expect(await t.query(api.baby.getByPublicId, { id: "baby-2" })).toMatchObject({
    _id: claimant.babyId,
    publicId: "baby",
  });
  expect(await t.query(api.baby.getByPublicId, { id: "baby-3" })).toMatchObject({
    _id: occupant.babyId,
    publicId: "baby-3",
  });

  const transfers = await asDemo.query(api.admin.listPublicIdTransfers, {
    paginationOpts: FIRST_PAGE,
  });
  expect(transfers.page).toHaveLength(1);
  expect(transfers.page[0]).toMatchObject({
    actorEmail: DEMO_USER.email,
    actorUserId: seeded.userId,
    babyId: claimant.babyId,
    babyName: "Baby",
    displacedBabyId: occupant.babyId,
    displacedBabyName: "Baby",
    displacedPublicId: "baby-3",
    fromPublicId: "baby-2",
    motivation: "Give the real page the canonical slug",
    toPublicId: "baby",
  });
  expect(transfers.page[0]!.createdAt).toBeGreaterThan(0);
});

test("admins can transfer a free permalink without displacing another baby", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });
  const asBob = t.withIdentity({ subject: "bob" });

  const claimant = await asBob.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Real Baby" }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(claimant.babyId, { publicId: "baby-2" });
  });

  await asDemo.mutation(api.admin.transferPublicId, {
    fromPublicId: "baby-2",
    motivation: "Canonical slug is free",
    toPublicId: "baby",
  });

  expect(await t.query(api.baby.getByPublicId, { id: "baby" })).toMatchObject({
    _id: claimant.babyId,
    publicId: "baby",
  });
  expect(await t.query(api.baby.getByPublicId, { id: "baby-2" })).toMatchObject({
    _id: claimant.babyId,
    publicId: "baby",
  });

  const transfers = await asDemo.query(api.admin.listPublicIdTransfers, {
    paginationOpts: FIRST_PAGE,
  });
  expect(transfers.page[0]).toMatchObject({
    actorEmail: DEMO_USER.email,
    displacedBabyId: null,
    displacedBabyName: null,
    displacedPublicId: null,
    fromPublicId: "baby-2",
    motivation: "Canonical slug is free",
    toPublicId: "baby",
  });
});

test("transferPublicId refuses homepage demo slugs and missing babies", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });
  const asBob = t.withIdentity({ subject: "bob" });
  await asBob.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Real Baby" }),
  );

  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "real-baby",
      motivation: "Should not move a demo slug",
      toPublicId: "juniper-hale",
    }),
  ).rejects.toThrow("Homepage demo public IDs cannot be transferred");
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "juniper-hale",
      motivation: "Should not move a demo slug",
      toPublicId: "baby",
    }),
  ).rejects.toThrow("Homepage demo public IDs cannot be transferred");
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "missing-slug",
      motivation: "Should not move a missing slug",
      toPublicId: "baby",
    }),
  ).rejects.toThrow('No baby currently uses public ID "missing-slug"');
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "real-baby",
      motivation: "   ",
      toPublicId: "baby",
    }),
  ).rejects.toThrow("Motivation is required");
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "real-baby",
      motivation: "noop",
      toPublicId: "Real Baby",
    }),
  ).rejects.toThrow("New public ID must be different from the current one");
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "real-baby",
      motivation: "x".repeat(501),
      toPublicId: "baby",
    }),
  ).rejects.toThrow("Motivation must be 500 characters or fewer");
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "!!!",
      motivation: "Invalid slug",
      toPublicId: "baby",
    }),
  ).rejects.toThrow("Public ID must contain letters or numbers");

  const deleted = await asBob.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Gone Baby" }),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(deleted.babyId, { deletedAt: Date.now() });
  });
  await expect(
    asDemo.mutation(api.admin.transferPublicId, {
      fromPublicId: "gone-baby",
      motivation: "Soft-deleted claimant",
      toPublicId: "baby",
    }),
  ).rejects.toThrow('No baby currently uses public ID "gone-baby"');
});
