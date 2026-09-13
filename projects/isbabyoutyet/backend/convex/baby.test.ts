import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { makeResource } from "./test.resource";
import { modules, registerComponents, createBabyArgs, postUpdateArgs } from "./test.setup";

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

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );

  expect(created.publicId).toBe("baby-smith");
  const stored = await t.run(async (ctx) => ctx.db.get(created.babyId));
  expect(stored?.birthJourney).toBe("labor");
  expect(stored?.dueDateDisplayMode).toBe("exact");
  expect(stored?.publicDueDateText).toBeNull();

  const babies = await asAlice.query(api.baby.listByUser, {});
  expect(babies).toMatchObject([
    {
      _id: created.babyId,
      dueDate: "2026-09-01",
      name: "Baby Smith",
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
    issuer: "https://other-issuer.test",
    subject: "alice",
  });
  expect(await sameSubjectFromAnotherIssuer.query(api.baby.listByUser, {})).toEqual([]);
  await expect(
    sameSubjectFromAnotherIssuer.mutation(api.baby.update, {
      id: created.babyId,
      patch: {
        name: "Not Alice",
      },
    }),
  ).rejects.toThrow("Not authorized");
  expect(await t.query(api.baby.listByUser, {})).toEqual([]);
});

test("creation stores the selected journey and only exposes derived visibility publicly", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      birthJourney: "planned_c_section",
      dueDate: "2026-09-01",
      name: "Flexible Page",
    }),
  );

  const baby = await t.run(async (ctx) => await ctx.db.get(created.babyId));
  expect(baby?.birthJourney).toBe("planned_c_section");
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    milestoneVisibility: { showHospital: true, showLabor: false },
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
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-19",
      dueDateDisplayMode: "message",
      name: "Waiting Baby",
      publicDueDateText: "  Any day now  ",
    }),
  );

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
    id: created.babyId,
    patch: {
      dueDateDisplayMode: "exact",
    },
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
    id: created.babyId,
    patch: {
      dueDateDisplayMode: "message",
    },
  });
  const publicMessageAgain = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicMessageAgain).toMatchObject({
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
  expect(publicMessageAgain).not.toHaveProperty("dueDate");
  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      dueDateDisplayMode: "message",
      publicDueDateText: "   ",
    },
  });
  const publicBlankMessage = await t.query(api.baby.getByPublicId, { id: created.publicId });
  if (!publicBlankMessage) {
    throw new Error("expected public baby");
  }
  expect(publicBlankMessage).toMatchObject({
    dueDateDisplayMode: "message",
  });
  expect(publicBlankMessage).not.toHaveProperty("publicDueDateText");
  expect(publicBlankMessage).not.toHaveProperty("dueDate");
  await expect(
    asAlice.mutation(api.baby.update, {
      id: created.babyId,
      patch: {
        dueDateDisplayMode: "message",
        publicDueDateText: "x".repeat(81),
      },
    }),
  ).rejects.toThrow("80 characters or fewer");
  await expect(
    asAlice.mutation(api.baby.update, {
      id: created.babyId,
      patch: {
        dueDate: null,
        dueDateDisplayMode: "exact",
        publicDueDateText: null,
      },
    }),
  ).rejects.toThrow("due date is required");
});

test("public DTO rejects exact mode without a due date", async () => {
  const t = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: null,
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Missing Date",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "missing-date",
      subscriptionCount: 0,
      userId: "alice",
    });
    await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "message",
      lastActivityAt: 1,
      name: "Blank Message",
      ownerTokenIdentifier: "https://convex.test|alice",
      publicDueDateText: null,
      publicId: "blank-message",
      subscriptionCount: 0,
      userId: "alice",
    });
  });

  await expect(t.query(api.baby.getByPublicId, { id: "missing-date" })).rejects.toThrow(
    "Exact due date display requires a due date",
  );
  const blankMessage = await t.query(api.baby.getByPublicId, { id: "blank-message" });
  if (!blankMessage) {
    throw new Error("expected blank message baby");
  }
  expect(blankMessage).toMatchObject({ dueDateDisplayMode: "message" });
  expect(blankMessage).not.toHaveProperty("publicDueDateText");
  expect(blankMessage).not.toHaveProperty("dueDate");
});

test("journey selection can change after milestone updates without deleting them", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      birthJourney: "home_birth",
      dueDate: "2026-09-01",
      name: "Baby",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "labor_started",
      occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
    }),
  );
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "gone_to_hospital",
      occurredAt: Date.parse("2026-08-10T12:00:00.000Z"),
    }),
  );
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "born",
      occurredAt: Date.parse("2026-08-11T03:00:00.000Z"),
    }),
  );
  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      birthJourney: "planned_c_section",
    },
  });

  const baby = await t.run(async (ctx) => await ctx.db.get(created.babyId));
  expect(baby?.birthJourney).toBe("planned_c_section");
  expect(baby).not.toHaveProperty("laborStarted");
  const publicBaby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(publicBaby).toMatchObject({
    babyBorn: "2026-08-11T03:00:00.000Z",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
  });
});

test("getByPublicId resolves by publicId and by document id", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-15",
      name: "Little One",
    }),
  );

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

test("manager queries resolve babyId or publicId slug", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-15",
      name: "Little One",
    }),
  );

  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.publicId })).toMatchObject({
    name: "Little One",
  });
  expect(await t.query(api.baby.getManagerBaby, { babyId: created.publicId })).toBe("forbidden");
  expect(await asAlice.query(api.timeline.latestUpdate, { babyId: created.publicId })).toBeNull();
});

test("a baby inherits the owner locale until an override is set", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.profile.updateLocale, { locale: "sv" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-15",
      name: "Little One",
    }),
  );

  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    resolvedLocale: "sv",
  });

  await asAlice.mutation(api.profile.updateLocale, { locale: "es" });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    resolvedLocale: "es",
  });

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      locale: "en-US",
    },
  });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    locale: "en-US",
    resolvedLocale: "en-US",
  });

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      locale: null,
    },
  });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    locale: null,
    resolvedLocale: "es",
  });
});

test("a baby inherits its owner's time zone without a baby override", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-15",
      name: "Little One",
    }),
  );

  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    timeZone: "Europe/London",
  });

  await asAlice.mutation(api.profile.updateTimeZone, { timeZone: "Asia/Tokyo" });
  expect(await t.query(api.baby.getByPublicId, { id: created.publicId })).toMatchObject({
    timeZone: "Asia/Tokyo",
  });
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    timeZone: "Asia/Tokyo",
  });
  expect(await asAlice.query(api.baby.listByUser, {})).toMatchObject([{ timeZone: "Asia/Tokyo" }]);
});

test("renaming a baby rotates the publicId and keeps the old one resolvable", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Working Title",
    }),
  );
  expect(created.publicId).toBe("working-title");

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      name: "Final Name",
    },
  });

  const byNewPublicId = await t.query(api.baby.getByPublicId, { id: "final-name" });
  expect(byNewPublicId).toMatchObject({ _id: created.babyId, name: "Final Name" });

  // Historical publicId still resolves to the same baby
  const byOldPublicId = await t.query(api.baby.getByPublicId, { id: "working-title" });
  expect(byOldPublicId).toMatchObject({ _id: created.babyId, name: "Final Name" });

  const sameSubjectFromAnotherIssuer = t.withIdentity({
    issuer: "https://other-issuer.test",
    subject: "alice",
  });
  const impostorBaby = await sameSubjectFromAnotherIssuer.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Working Title",
    }),
  );
  expect(impostorBaby.publicId).toBe("working-title-1");
});

test("renaming a baby without changing the slug keeps the publicId", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );
  expect(created.publicId).toBe("baby-smith");

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      name: "Baby smith",
    },
  });

  const after = await t.query(api.baby.getByPublicId, { id: "baby-smith" });
  expect(after).toMatchObject({
    _id: created.babyId,
    name: "Baby smith",
    publicId: "baby-smith",
  });
});

test("getByPublicId ogImageHash changes when the public page would look different", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );

  const before = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(before?.ogImageHash).toEqual(expect.any(String));

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: { theme: "baby-blue" },
  });
  const afterTheme = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(afterTheme?.ogImageHash).not.toBe(before?.ogImageHash);

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: { name: "Nova Rae" },
  });
  const afterName = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(afterName?.ogImageHash).not.toBe(afterTheme?.ogImageHash);
});

test("sparse baby.update patch leaves omitted keys and same-slug names unchanged", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      dueDateDisplayMode: "message",
      name: "Working Title",
      publicDueDateText: "Any day now",
    }),
  );
  expect(created.publicId).toBe("working-title");

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {},
  });
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    dueDate: "2026-09-01",
    dueDateDisplayMode: "message",
    name: "Working Title",
    publicDueDateText: "Any day now",
    publicId: "working-title",
  });

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      name: "Working Title",
    },
  });
  expect(await t.query(api.baby.getByPublicId, { id: "working-title" })).toMatchObject({
    name: "Working Title",
  });

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      name: "working title",
    },
  });
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    name: "working title",
    publicId: "working-title",
  });

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      publicDueDateText: "Soon",
    },
  });
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    dueDate: "2026-09-01",
    dueDateDisplayMode: "message",
    publicDueDateText: "Soon",
  });

  await asAlice.mutation(api.baby.update, {
    id: created.babyId,
    patch: {
      dueDate: "2026-10-15",
    },
  });
  expect(await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId })).toMatchObject({
    dueDate: "2026-10-15",
    dueDateDisplayMode: "message",
    publicDueDateText: "Soon",
  });
});

test("homepage demo publicIds are reserved and never assigned to real babies", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Juniper Hale",
    }),
  );
  expect(created.publicId).toBe("juniper-hale-1");
});

test("status is inferred from milestone updates, not stored baby fields", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "labor_started",
      occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
    }),
  );

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
    babyBorn: null,
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null,
  });

  const listed = await asAlice.query(api.baby.listByUser, {});
  expect(listed).toMatchObject([{ laborStarted: "2026-08-10T08:00:00.000Z" }]);
});

test("moving the status forward schedules a push notification", async () => {
  await using _timers = useFakeTimersResource();

  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "labor_started",
      occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
    }),
  );

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(notifications).toMatchObject([
    {
      customMessage: null,
      notificationType: "labor_started",
      status: "pending",
    },
  ]);

  // Moving further forward cancels the pending one and schedules the next
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "born",
      occurredAt: Date.parse("2026-08-11T03:00:00.000Z"),
    }),
  );

  const afterBirth = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(afterBirth).toHaveLength(2);
  expect(afterBirth).toMatchObject([
    { notificationType: "born", status: "pending" },
    { notificationType: "labor_started", status: "cancelled" },
  ]);
});

test("the owner can cancel a pending status notification", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "labor_started",
    }),
  );

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
  expect(after).toMatchObject([{ notificationType: "labor_started", status: "cancelled" }]);
});

test("status forward does not cancel a pending generic update push", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      message: "Packing the bag",
    }),
  );
  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "labor_started",
      occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
    }),
  );

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(notifications).toMatchObject([
    { notificationType: "labor_started", status: "pending" },
    {
      customMessage: "Packing the bag",
      notificationType: "update_posted",
      status: "pending",
    },
  ]);
});

test("owner can soft-delete a baby; it disappears from lists and public lookup", async () => {
  await using _timers = useFakeTimersResource();
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Soft Delete Me",
    }),
  );

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      milestone: "labor_started",
      occurredAt: Date.parse("2026-08-10T08:00:00.000Z"),
    }),
  );

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
