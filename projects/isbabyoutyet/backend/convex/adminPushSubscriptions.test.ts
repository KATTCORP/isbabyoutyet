import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { babyPageUrl } from "../src/babyFeedUrl";
import schema from "./schema";
import { makeResource } from "./test.resource";
import { createBabyArgs, modules, registerComponents } from "./test.setup";

const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15";
const ALL = { cursor: null, numItems: 100 };

function deviceKeys(endpoint: string) {
  return { auth: `auth-${endpoint}`, endpoint, p256dh: `p256dh-${endpoint}` };
}

async function setup() {
  const t = convexTest(schema, modules);
  registerComponents(t);
  return t;
}

type TestConvex = Awaited<ReturnType<typeof setup>>;

async function signIn(t: TestConvex, opts: { isAdmin: boolean; subject: string }) {
  const user = t.withIdentity({ subject: opts.subject });
  await user.mutation(api.profile.updateLocale, { locale: "sv" });
  await t.run(async (ctx) => {
    const profiles = await ctx.db.query("userProfiles").collect();
    for (const profile of profiles) {
      if (profile.userId === opts.subject) {
        await ctx.db.patch(profile._id, { isAdmin: opts.isAdmin });
      }
    }
  });
  return user;
}

/**
 * Tests have no VAPID keys, so every send fails before reaching the network
 * and the action logs a failure summary per run.
 */
function captureSendSummaryLog() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  return makeResource({ log }, () => {
    log.mockRestore();
  });
}

test("only admins can subscribe or unsubscribe a device", async () => {
  const t = await setup();
  const asAlice = await signIn(t, { isAdmin: false, subject: "alice" });
  const keys = deviceKeys("https://push.example/alice");

  await expect(
    asAlice.mutation(api.adminPushSubscriptions.subscribe, { ...keys, userAgent: USER_AGENT }),
  ).rejects.toThrow("Not authorized");
  await expect(asAlice.mutation(api.adminPushSubscriptions.unsubscribe, keys)).rejects.toThrow(
    "Not authorized",
  );
  await expect(
    t.mutation(api.adminPushSubscriptions.subscribe, { ...keys, userAgent: USER_AGENT }),
  ).rejects.toThrow("Not authenticated");
  expect(
    await asAlice.query(api.adminPushSubscriptions.isSubscribed, { endpoint: keys.endpoint }),
  ).toBe(false);
  expect(await t.run((ctx) => ctx.db.query("adminPushSubscriptions").collect())).toEqual([]);
});

test("an admin's device subscription is one row per endpoint, removable only with its keys", async () => {
  const t = await setup();
  const asAlex = await signIn(t, { isAdmin: true, subject: "alex" });
  const asSam = await signIn(t, { isAdmin: true, subject: "sam" });
  const keys = deviceKeys("https://push.example/alex-phone");

  await asAlex.mutation(api.adminPushSubscriptions.subscribe, { ...keys, userAgent: USER_AGENT });
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, { ...keys, userAgent: USER_AGENT });
  expect(await t.run((ctx) => ctx.db.query("adminPushSubscriptions").collect())).toMatchObject([
    { endpoint: keys.endpoint, userAgent: USER_AGENT, userId: "alex" },
  ]);
  expect(
    await asAlex.query(api.adminPushSubscriptions.isSubscribed, { endpoint: keys.endpoint }),
  ).toBe(true);
  expect(
    await asSam.query(api.adminPushSubscriptions.isSubscribed, { endpoint: keys.endpoint }),
  ).toBe(false);

  await asAlex.mutation(api.adminPushSubscriptions.unsubscribe, { ...keys, auth: "wrong" });
  expect(
    await asAlex.query(api.adminPushSubscriptions.isSubscribed, { endpoint: keys.endpoint }),
  ).toBe(true);

  await asAlex.mutation(api.adminPushSubscriptions.unsubscribe, keys);
  expect(
    await asAlex.query(api.adminPushSubscriptions.isSubscribed, { endpoint: keys.endpoint }),
  ).toBe(false);
});

test("recipients are re-checked at send time, so a demoted admin's device gets nothing", async () => {
  const t = await setup();
  const asAlex = await signIn(t, { isAdmin: true, subject: "alex" });
  const asSam = await signIn(t, { isAdmin: true, subject: "sam" });
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, {
    ...deviceKeys("https://push.example/alex"),
    userAgent: USER_AGENT,
  });
  await asSam.mutation(api.adminPushSubscriptions.subscribe, {
    ...deviceKeys("https://push.example/sam"),
    userAgent: USER_AGENT,
  });
  await signIn(t, { isAdmin: false, subject: "sam" });

  const recipients = await t.query(internal.adminPushSubscriptions.getRecipientsPage, {
    paginationOpts: ALL,
  });
  expect(recipients.page).toEqual([{ ...deviceKeys("https://push.example/alex"), locale: "sv" }]);
});

test("creating a baby page pushes to every admin device", async () => {
  await using logs = captureSendSummaryLog();
  const t = await setup();
  const asAlex = await signIn(t, { isAdmin: true, subject: "alex" });
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, {
    ...deviceKeys("https://push.example/alex"),
    userAgent: USER_AGENT,
  });
  const asParent = await signIn(t, { isAdmin: false, subject: "parent" });

  const created = await asParent.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-12-01", name: "Baby Nova" }),
  );
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled).toContainEqual(
    expect.objectContaining({
      args: [{ babyId: created.babyId }],
      name: "pushNotifications:notifyAdminsOfNewBaby",
    }),
  );

  await t.finishAllScheduledFunctions(() => {});
  expect(logs.log).toHaveBeenCalledWith("Sent notifications: 0 succeeded, 1 failed");
});

test("a baby page deleted before the push runs notifies no one", async () => {
  await using logs = captureSendSummaryLog();
  const t = await setup();
  const asAlex = await signIn(t, { isAdmin: true, subject: "alex" });
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, {
    ...deviceKeys("https://push.example/alex"),
    userAgent: USER_AGENT,
  });
  const asParent = await signIn(t, { isAdmin: false, subject: "parent" });
  const created = await asParent.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-12-01", name: "Baby Nova" }),
  );
  await asParent.mutation(api.baby.remove, { babyId: created.babyId });

  expect(
    await t.query(internal.adminPushSubscriptions.getNewBaby, { babyId: created.babyId }),
  ).toBeNull();
  // Run only the new-baby push: `remove` also schedules the dismiss, which does send.
  await t.action(internal.pushNotifications.notifyAdminsOfNewBaby, { babyId: created.babyId });
  expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining("Sent notifications"));
});

test("deleting a baby page dismisses the new-baby alert on admin devices", async () => {
  await using logs = captureSendSummaryLog();
  const t = await setup();
  const asAlex = await signIn(t, { isAdmin: true, subject: "alex" });
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, {
    ...deviceKeys("https://push.example/alex"),
    userAgent: USER_AGENT,
  });
  const asParent = await signIn(t, { isAdmin: false, subject: "parent" });
  const created = await asParent.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-12-01", name: "Baby Nova" }),
  );
  await t.finishAllScheduledFunctions(() => {});
  logs.log.mockClear();

  await asParent.mutation(api.baby.remove, { babyId: created.babyId });
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled).toContainEqual(
    expect.objectContaining({
      args: [{ babyId: created.babyId }],
      name: "pushNotifications:dismissAdminNewBabyNotification",
    }),
  );

  await t.finishAllScheduledFunctions(() => {});
  expect(logs.log).toHaveBeenCalledWith("Sent notifications: 0 succeeded, 1 failed");
});

test("the alert links by baby id, which still finds the page after a rename", async () => {
  const t = await setup();
  const asParent = await signIn(t, { isAdmin: false, subject: "parent" });
  const created = await asParent.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-12-01", name: "Baby Nova" }),
  );
  await asParent.mutation(api.baby.update, { id: created.babyId, patch: { name: "Luna" } });

  expect(babyPageUrl(created.babyId)).toBe(`/baby/${created.babyId}`);
  expect(await t.query(api.baby.getByPublicId, { id: created.babyId })).toMatchObject({
    name: "Luna",
    publicId: "luna",
  });
});

test("an expired endpoint is pruned from admin subscriptions too", async () => {
  const t = await setup();
  const asAlex = await signIn(t, { isAdmin: true, subject: "alex" });
  const expired = deviceKeys("https://push.example/expired");
  const kept = deviceKeys("https://push.example/kept");
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, {
    ...expired,
    userAgent: USER_AGENT,
  });
  await asAlex.mutation(api.adminPushSubscriptions.subscribe, { ...kept, userAgent: USER_AGENT });

  await t.mutation(internal.pushSubscriptions.removeByEndpoint, { endpoint: expired.endpoint });

  expect(await t.run((ctx) => ctx.db.query("adminPushSubscriptions").collect())).toMatchObject([
    { endpoint: kept.endpoint },
  ]);
});
