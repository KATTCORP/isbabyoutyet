import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { makeResource } from "./test.resource";
import { modules, registerComponents } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

function useFakeTimersResource() {
  vi.useFakeTimers();
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

test("create a baby and list it for the owner", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby Smith",
    dueDate: "2026-09-01",
  });

  expect(created.publicId).toBe("baby-smith");
  const stored = await t.run(async (ctx) => ctx.db.get(created.babyId));
  expect(stored?.birthJourney).toBe("labor");
  expect(stored?.dueDateDisplayMode).toBe("exact");
  expect(stored?.publicDueDateText).toBeNull();

  const babies = await asAlice.query(api.baby.listByUser, {});
  expect(babies).toMatchObject([
    {
      _id: created.babyId,
      name: "Baby Smith",
      dueDate: "2026-09-01",
      publicId: "baby-smith",
      role: "owner",
    },
  ]);
  expect(babies[0]).not.toHaveProperty("userId");
  expect(babies[0]).not.toHaveProperty("ownerTokenIdentifier");
  expect(babies[0]).not.toHaveProperty("lastActivityAt");
  expect(babies[0]).not.toHaveProperty("subscriptionCount");
  expect(babies[0]?.birthJourney).toBe("labor");

  // Other users (and anonymous visitors) don't see it in their list
  const asBob = t.withIdentity({ subject: "bob" });
  expect(await asBob.query(api.baby.listByUser, {})).toEqual([]);
  const sameSubjectFromAnotherIssuer = t.withIdentity({
    subject: "alice",
    issuer: "https://other-issuer.test",
  });
  expect(await sameSubjectFromAnotherIssuer.query(api.baby.listByUser, {})).toEqual([]);
  await expect(
    sameSubjectFromAnotherIssuer.mutation(api.baby.update, {
      babyId: created.babyId,
      name: "Not Alice",
    }),
  ).rejects.toThrow("Not authorized");
  expect(await t.query(api.baby.listByUser, {})).toEqual([]);
});

test("creation stores the selected journey and only exposes derived visibility publicly", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Flexible Page",
    dueDate: "2026-09-01",
    birthJourney: "planned_c_section",
  });

  const baby = await t.run(async (ctx) => await ctx.db.get(created.babyId));
  expect(baby?.birthJourney).toBe("planned_c_section");
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    milestoneVisibility: { showLabor: false, showHospital: true },
  });
  expect(await asAlice.query(api.baby.getBirthJourney, { babyId: created.babyId })).toBe(
    "planned_c_section",
  );
  expect(await t.query(api.baby.getBirthJourney, { babyId: created.babyId })).toBe("forbidden");
  expect(
    await t
      .withIdentity({ subject: "bob" })
      .query(api.baby.getBirthJourney, { babyId: created.babyId }),
  ).toBe("forbidden");
});

test("custom public due date text hides the exact day from visitors", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Waiting Baby",
    dueDate: "2026-09-19",
    dueDateDisplayMode: "message",
    publicDueDateText: "  Any day now  ",
  });

  const publicMessageBaby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicMessageBaby).toMatchObject({
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
  expect(publicMessageBaby).not.toHaveProperty("dueDate");
  expect(
    await t
      .withIdentity({ subject: "bob" })
      .query(api.baby.getByPublicId, { id: created.publicId }),
  ).toMatchObject({
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
  expect(await asAlice.query(api.baby.getByPublicId, { id: created.publicId })).not.toHaveProperty(
    "dueDate",
  );
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    dueDate: "2026-09-19",
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
  expect(await t.query(api.baby.getManagerBaby, { babyId: created.babyId })).toBe("forbidden");

  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    dueDateDisplayMode: "exact",
  });
  const publicExactBaby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicExactBaby).toMatchObject({
    dueDate: "2026-09-19",
    dueDateDisplayMode: "exact",
  });
  expect(publicExactBaby).not.toHaveProperty("publicDueDateText");
  expect(await asAlice.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    dueDate: "2026-09-19",
    dueDateDisplayMode: "exact",
  });
  expect(await asAlice.query(api.baby.getByPublicId, { id: created.publicId })).not.toHaveProperty(
    "publicDueDateText",
  );
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    dueDate: "2026-09-19",
    dueDateDisplayMode: "exact",
    publicDueDateText: "Any day now",
  });
  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    dueDateDisplayMode: "message",
  });
  const publicMessageAgain = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicMessageAgain).toMatchObject({
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
  expect(publicMessageAgain).not.toHaveProperty("dueDate");
  await expect(
    asAlice.mutation(api.baby.update, {
      babyId: created.babyId,
      dueDateDisplayMode: "message",
      publicDueDateText: "   ",
    }),
  ).rejects.toThrow("message is required");
  await expect(
    asAlice.mutation(api.baby.update, {
      babyId: created.babyId,
      dueDateDisplayMode: "message",
      publicDueDateText: "x".repeat(81),
    }),
  ).rejects.toThrow("80 characters or fewer");
  await expect(
    asAlice.mutation(api.baby.update, {
      babyId: created.babyId,
      dueDate: null,
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
    }),
  ).rejects.toThrow("due date is required");
});

test("public DTO rejects invalid due date display combinations", async () => {
  const t = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("baby", {
      userId: "alice",
      ownerTokenIdentifier: "https://convex.test|alice",
      name: "Missing Date",
      dueDate: null,
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
      publicId: "missing-date",
      birthJourney: "labor",
      subscriptionCount: 0,
      lastActivityAt: 1,
    });
    await ctx.db.insert("baby", {
      userId: "alice",
      ownerTokenIdentifier: "https://convex.test|alice",
      name: "Missing Message",
      dueDate: null,
      dueDateDisplayMode: "message",
      publicDueDateText: null,
      publicId: "missing-message",
      birthJourney: "labor",
      subscriptionCount: 0,
      lastActivityAt: 1,
    });
  });

  await expect(t.query(api.baby.getByPublicId, { id: "missing-date" })).rejects.toThrow(
    "Exact due date display requires a due date",
  );
  await expect(t.query(api.baby.getByPublicId, { id: "missing-message" })).rejects.toThrow(
    "Message due date display requires public text",
  );
});

test("journey selection can change after milestone updates without deleting them", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby",
    dueDate: "2026-09-01",
    birthJourney: "home_birth",
  });

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "labor_started",
    occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
  });
  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "gone_to_hospital",
    occurredAt: Date.parse("2026-08-10T12:00:00.000Z"),
  });
  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "born",
    occurredAt: Date.parse("2026-08-11T03:00:00.000Z"),
  });
  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    birthJourney: "planned_c_section",
  });

  const baby = await t.run(async (ctx) => await ctx.db.get(created.babyId));
  expect(baby?.birthJourney).toBe("planned_c_section");
  expect(baby).not.toHaveProperty("laborStarted");
  const publicBaby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicBaby).toMatchObject({
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
    babyBorn: "2026-08-11T03:00:00.000Z",
  });
});

test("getByPublicId resolves by publicId and by document id", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Little One",
    dueDate: "2026-10-15",
  });

  const byPublicId = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(byPublicId).toMatchObject({ _id: created.babyId, name: "Little One" });
  expect(byPublicId).not.toHaveProperty("userId");
  expect(byPublicId).not.toHaveProperty("ownerTokenIdentifier");
  expect(byPublicId).not.toHaveProperty("lastActivityAt");
  expect(byPublicId).not.toHaveProperty("subscriptionCount");
  expect(byPublicId).not.toHaveProperty("birthJourney");

  const byDocumentId = await t.query(api.baby.getByPublicId, { id: created.babyId });
  expect(byDocumentId).toMatchObject({ publicId: created.publicId });
});

test("a baby inherits the owner locale until an override is set", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.profile.ensure, { browserLocale: "sv-SE" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Little One",
    dueDate: "2026-10-15",
  });

  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    resolvedLocale: "sv",
  });

  await asAlice.mutation(api.profile.updateLocale, { locale: "es" });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    resolvedLocale: "es",
  });

  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    locale: "en-US",
  });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    locale: "en-US",
    resolvedLocale: "en-US",
  });

  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    locale: null,
  });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    locale: null,
    resolvedLocale: "es",
  });
});

test("renaming a baby rotates the publicId and keeps the old one resolvable", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Working Title",
    dueDate: "2026-09-01",
  });
  expect(created.publicId).toBe("working-title");

  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    name: "Final Name",
  });

  const byNewPublicId = await t.query(api.baby.getByPublicId, { id: "final-name" });
  expect(byNewPublicId).toMatchObject({ _id: created.babyId, name: "Final Name" });

  // Historical publicId still resolves to the same baby
  const byOldPublicId = await t.query(api.baby.getByPublicId, { id: "working-title" });
  expect(byOldPublicId).toMatchObject({ _id: created.babyId, name: "Final Name" });

  const sameSubjectFromAnotherIssuer = t.withIdentity({
    subject: "alice",
    issuer: "https://other-issuer.test",
  });
  const impostorBaby = await sameSubjectFromAnotherIssuer.mutation(api.baby.create, {
    name: "Working Title",
    dueDate: "2026-09-01",
  });
  expect(impostorBaby.publicId).toBe("working-title-1");
});

test("homepage demo publicIds are reserved and never assigned to real babies", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Juniper Hale",
    dueDate: "2026-09-01",
  });
  expect(created.publicId).toBe("juniper-hale-1");
});

test("status is inferred from milestone updates, not stored baby fields", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby",
    dueDate: "2026-09-01",
  });

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "labor_started",
    occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
  });

  const stored = await t.run(async (ctx) => ctx.db.get(created.babyId));
  for (const field of [
    "laborStarted",
    "wentToHospital",
    "babyBorn",
    "laborStartedMessage",
    "hospitalMessage",
    "babyBornMessage",
  ] as const) {
    expect(stored).not.toHaveProperty(field);
  }

  const publicBaby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicBaby).toMatchObject({
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null,
    babyBorn: null,
  });

  const listed = await asAlice.query(api.baby.listByUser, {});
  expect(listed).toMatchObject([{ laborStarted: "2026-08-10T08:00:00.000Z" }]);
});

test("moving the status forward schedules a push notification", async () => {
  await using _timers = useFakeTimersResource();

  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby",
    dueDate: "2026-09-01",
  });

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "labor_started",
    occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
  });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(notifications).toMatchObject([
    {
      status: "pending",
      notificationType: "labor_started",
      customMessage: null,
    },
  ]);

  // Moving further forward cancels the pending one and schedules the next
  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "born",
    occurredAt: Date.parse("2026-08-11T03:00:00.000Z"),
  });

  const afterBirth = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(afterBirth).toHaveLength(2);
  expect(afterBirth).toMatchObject([
    { status: "pending", notificationType: "born" },
    { status: "cancelled", notificationType: "labor_started" },
  ]);
});

test("the owner can cancel a pending status notification", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby",
    dueDate: "2026-09-01",
  });

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "labor_started",
  });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  if (!Array.isArray(notifications) || !notifications[0]) {
    throw new Error("expected a pending notification");
  }

  await asAlice.mutation(api.baby.cancelScheduledNotification, {
    notificationId: notifications[0]._id,
  });

  const after = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(after).toMatchObject([{ status: "cancelled", notificationType: "labor_started" }]);
});

test("status forward does not cancel a pending generic update push", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby",
    dueDate: "2026-09-01",
  });

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    message: "Packing the bag",
  });
  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "labor_started",
    occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
  });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(notifications).toMatchObject([
    { status: "pending", notificationType: "labor_started" },
    {
      status: "pending",
      notificationType: "update_posted",
      customMessage: "Packing the bag",
    },
  ]);
});

test("owner can soft-delete a baby; it disappears from lists and public lookup", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Soft Delete Me",
    dueDate: "2026-09-01",
  });

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    milestone: "labor_started",
    occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
  });

  await expect(asBob.mutation(api.baby.remove, { babyId: created.babyId })).rejects.toThrow(
    "Not authorized",
  );

  await asAlice.mutation(api.baby.remove, { babyId: created.babyId });

  expect(await asAlice.query(api.baby.listByUser, {})).toEqual([]);
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toBeNull();

  const stored = await t.run(async (ctx) => ctx.db.get(created.babyId));
  expect(stored?.deletedAt).toEqual(expect.any(Number));

  const notifications = await t.run(async (ctx) => {
    return await ctx.db
      .query("scheduledNotifications")
      .withIndex("by_babyId", (q) => q.eq("babyId", created.babyId))
      .collect();
  });
  expect(notifications.every((n) => n.status === "cancelled")).toBe(true);
});
