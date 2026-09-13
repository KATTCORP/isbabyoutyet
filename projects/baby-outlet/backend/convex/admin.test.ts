import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { DEMO_USER, HOMEPAGE_DEMO_OWNER_USER_ID } from "../src/seedCredentials";
import { modules, registerComponents } from "./test.setup";

const FIRST_PAGE = { numItems: 20, cursor: null };

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

test("admin queries refuse non-admins and anonymous callers", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.profile.ensure, { browserLocale: "en-GB" });

  await expect(
    asAlice.query(api.admin.listLanguageRequests, { paginationOpts: FIRST_PAGE }),
  ).rejects.toThrow("Not authorized");
  await expect(
    asAlice.query(api.admin.listBabies, {
      sortBy: "created",
      sortOrder: "desc",
      hideDemo: true,
      paginationOpts: FIRST_PAGE,
    }),
  ).rejects.toThrow("Not authorized");
  await expect(
    t.query(api.admin.listLanguageRequests, { paginationOpts: FIRST_PAGE }),
  ).rejects.toThrow("Not authenticated");
});

test("seedDemoData marks the demo user as admin", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });

  expect(await asDemo.query(api.profile.get, {})).toMatchObject({
    locale: "en-GB",
    isAdmin: true,
  });

  await t.mutation(internal.seed.seedDemoData, {});
  expect(await asDemo.query(api.profile.get, {})).toMatchObject({ isAdmin: true });

  const sameSubjectFromAnotherIssuer = t.withIdentity({
    subject: seeded.userId,
    issuer: "https://other-issuer.test",
  });
  await expect(
    sameSubjectFromAnotherIssuer.query(api.admin.listLanguageRequests, {
      paginationOpts: FIRST_PAGE,
    }),
  ).rejects.toThrow("Not authorized");
});

test("admins can list language requests with requester emails", async () => {
  const t = await setup();
  const seeded = await t.mutation(internal.seed.seedDemoData, {});
  const asDemo = t.withIdentity({ subject: seeded.userId });

  const asBob = t.withIdentity({ subject: "bob" });
  await asBob.mutation(api.profile.ensure, { browserLocale: "en-GB" });
  await asBob.mutation(api.profile.requestLanguage, { requestedLocale: "French" });

  const requests = await asDemo.query(api.admin.listLanguageRequests, {
    paginationOpts: FIRST_PAGE,
  });
  expect(requests.page).toEqual([
    expect.objectContaining({
      requestedLocale: "French",
      userId: "bob",
      userEmail: null,
    }),
  ]);
  expect(requests.isDone).toBe(true);
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
  if (!waiting) throw new Error("missing waiting baby");

  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("babyCoParents", {
      babyId: waiting._id,
      userId: "co-parent-user",
      tokenIdentifier: "https://convex.test|co-parent-user",
      email: "coparent@example.com",
      name: "Co",
      addedByUserId: seeded.userId,
      addedAt: Date.now(),
    });
    await ctx.db.insert("babyCoParents", {
      babyId: waiting._id,
      userId: "gone-user",
      tokenIdentifier: "https://convex.test|gone-user",
      email: "gone@example.com",
      name: "Gone",
      addedByUserId: seeded.userId,
      addedAt: Date.now(),
      deletedAt: Date.now(),
    });
    await ctx.db.insert("babyCoParents", {
      babyId: waiting._id,
      userId: "dup-owner",
      tokenIdentifier: "https://convex.test|dup-owner",
      email: DEMO_USER.email,
      name: "Dup",
      addedByUserId: seeded.userId,
      addedAt: Date.now(),
    });
    await ctx.db.insert("baby", {
      userId: "unknown-owner",
      ownerTokenIdentifier: "https://convex.test|unknown-owner",
      name: "Deleted",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: "baby-deleted",
      birthJourney: "labor",
      lastActivityAt: now,
      subscriptionCount: 0,
      deletedAt: Date.now(),
    });
    await ctx.db.insert("baby", {
      userId: "unknown-owner",
      ownerTokenIdentifier: "https://convex.test|unknown-owner",
      name: "Quiet",
      dueDate: "2026-12-01",
      dueDateDisplayMode: "message",
      publicDueDateText: "Any day now",
      publicId: "baby-quiet",
      birthJourney: "labor",
      lastActivityAt: now,
      subscriptionCount: 0,
    });
    await ctx.db.insert("baby", {
      userId: HOMEPAGE_DEMO_OWNER_USER_ID,
      ownerTokenIdentifier: `https://convex.test|${HOMEPAGE_DEMO_OWNER_USER_ID}`,
      name: "Juniper Hale",
      dueDate: "2026-08-01",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: "juniper-hale",
      birthJourney: "labor",
      demo: true,
      lastActivityAt: now,
      subscriptionCount: 0,
    });
  });

  const byCreated = await asDemo.query(api.admin.listBabies, {
    sortBy: "created",
    sortOrder: "desc",
    hideDemo: false,
    paginationOpts: FIRST_PAGE,
  });
  expect(byCreated.page.some((row) => row.publicId === "baby-deleted")).toBe(false);
  expect(byCreated.page.some((row) => row.publicId === "baby-quiet")).toBe(true);
  const juniper = byCreated.page.find((row) => row.publicId === "juniper-hale");
  expect(juniper).toMatchObject({ demo: true, managerEmails: [] });
  for (let i = 1; i < byCreated.page.length; i++) {
    expect(byCreated.page[i - 1]!.createdAt).toBeGreaterThanOrEqual(byCreated.page[i]!.createdAt);
  }

  const hiddenDemos = await asDemo.query(api.admin.listBabies, {
    sortBy: "created",
    sortOrder: "desc",
    hideDemo: true,
    paginationOpts: FIRST_PAGE,
  });
  expect(hiddenDemos.page.every((row) => row.demo === false)).toBe(true);
  expect(hiddenDemos.page.some((row) => row.publicId === "juniper-hale")).toBe(false);
  expect(hiddenDemos.page.some((row) => row.publicId === "baby-quiet")).toBe(true);

  const byCreatedAsc = await asDemo.query(api.admin.listBabies, {
    sortBy: "created",
    sortOrder: "asc",
    hideDemo: false,
    paginationOpts: FIRST_PAGE,
  });
  expect(byCreatedAsc.page.map((row) => row._id)).toEqual(
    [...byCreated.page].reverse().map((row) => row._id),
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
    sortBy: "updated",
    sortOrder: "desc",
    hideDemo: false,
    paginationOpts: FIRST_PAGE,
  });
  expect(byUpdated.page.length).toBe(byCreated.page.length);
  for (let i = 1; i < byUpdated.page.length; i++) {
    expect(byUpdated.page[i - 1]!.updatedAt).toBeGreaterThanOrEqual(byUpdated.page[i]!.updatedAt);
  }

  // Tiny pages prove continueCursor pagination works.
  const page1 = await asDemo.query(api.admin.listBabies, {
    sortBy: "created",
    sortOrder: "desc",
    hideDemo: false,
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(page1.page).toHaveLength(2);
  expect(page1.isDone).toBe(false);
  const page2 = await asDemo.query(api.admin.listBabies, {
    sortBy: "created",
    sortOrder: "desc",
    hideDemo: false,
    paginationOpts: { numItems: 2, cursor: page1.continueCursor },
  });
  expect(page2.page.length).toBeGreaterThan(0);
  expect(page2.page[0]!._id).not.toBe(page1.page[0]!._id);

  await expect(
    asDemo.query(api.admin.listBabies, {
      sortBy: "created",
      sortOrder: "desc",
      hideDemo: false,
      paginationOpts: { numItems: 2, cursor: "nope" },
    }),
  ).rejects.toThrow(/not valid JSON/i);

  const asDemoRequester = t.withIdentity({ subject: seeded.userId });
  await asDemoRequester.mutation(api.profile.requestLanguage, { requestedLocale: "Welsh" });
  await asDemoRequester.mutation(api.profile.requestLanguage, { requestedLocale: "Irish" });
  const requests = await asDemo.query(api.admin.listLanguageRequests, {
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(requests.page).toHaveLength(1);
  expect(requests.isDone).toBe(false);
  const requestsPage2 = await asDemo.query(api.admin.listLanguageRequests, {
    paginationOpts: { numItems: 1, cursor: requests.continueCursor },
  });
  expect(requestsPage2.page).toHaveLength(1);
  expect(requestsPage2.page[0]!._id).not.toBe(requests.page[0]!._id);

  const authUser = await t.query(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: DEMO_USER.email }],
  });
  expect(authUser).toBeTruthy();
});
