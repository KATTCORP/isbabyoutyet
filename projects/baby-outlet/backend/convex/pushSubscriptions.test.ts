import { convexTest } from "convex-test";
import type { PaginationResult } from "convex/server";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs } from "./test.setup";

const TEST_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile Safari/537.36";

test("subscription secrets stay internal while managers see the exact count", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Push Baby",
    }),
  );

  await t.mutation(api.pushSubscriptions.subscribe, {
    auth: "private-auth-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/subscription",
    p256dh: "public-key",
    userAgent: TEST_USER_AGENT,
  });

  expect(
    await asAlice.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe(1);
  // Non-managers get a sentinel instead of a throw so the baby route loader
  // can query the count homogeneously for every visitor.
  expect(
    await asBob.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe("forbidden");
  expect(
    await t.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe("forbidden");

  const internalPage = await t.query(internal.pushSubscriptions.getSubscriptionsPage, {
    babyId: created.babyId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(internalPage.page).toMatchObject([
    {
      auth: "private-auth-secret",
      endpoint: "https://push.example/subscription",
      p256dh: "public-key",
      userAgent: TEST_USER_AGENT,
    },
  ]);

  await t.mutation(api.pushSubscriptions.unsubscribe, {
    auth: "wrong-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/subscription",
    p256dh: "wrong-key",
  });
  expect(
    await asAlice.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe(1);

  await t.mutation(api.pushSubscriptions.unsubscribe, {
    auth: "private-auth-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/subscription",
    p256dh: "public-key",
  });
  expect(
    await asAlice.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe(0);
});

test("internal pagination reaches every subscription without a cap", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Popular Push Baby",
    }),
  );

  await t.run(async (ctx) => {
    for (let index = 0; index < 205; index += 1) {
      await ctx.db.insert("pushSubscriptions", {
        auth: `secret-${index}`,
        babyId: created.babyId,
        createdAt: index,
        endpoint: `https://push.example/subscription-${index}`,
        p256dh: `key-${index}`,
      });
    }
    await ctx.db.patch(created.babyId, { subscriptionCount: 205 });
  });

  let cursor: string | null = null;
  let total = 0;
  for (;;) {
    const result: PaginationResult<Doc<"pushSubscriptions">> = await t.query(
      internal.pushSubscriptions.getSubscriptionsPage,
      {
        babyId: created.babyId,
        paginationOpts: { cursor, numItems: 100 },
      },
    );
    total += result.page.length;
    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  expect(total).toBe(205);
  expect(
    await asAlice.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe(205);
});

test("resubscribe rotates credentials and deleted babies reject new subscriptions", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Rotating Push Baby",
    }),
  );
  const args = {
    auth: "first-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/rotating",
    p256dh: "first-key",
    userAgent: TEST_USER_AGENT,
  };

  const firstId = await t.mutation(api.pushSubscriptions.subscribe, args);
  const secondId = await t.mutation(api.pushSubscriptions.subscribe, {
    ...args,
    auth: "rotated-secret",
    p256dh: "rotated-key",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
  });
  expect(secondId).toBe(firstId);
  const rotatedPage = await t.query(internal.pushSubscriptions.getSubscriptionsPage, {
    babyId: created.babyId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(rotatedPage.page).toMatchObject([
    {
      auth: "rotated-secret",
      p256dh: "rotated-key",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    },
  ]);
  expect(
    await t.query(api.pushSubscriptions.isSubscribed, {
      babyId: created.babyId,
      endpoint: args.endpoint,
    }),
  ).toBe(true);
  expect(
    await t.query(api.pushSubscriptions.isSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/missing",
    }),
  ).toBe(false);

  await t.mutation(internal.pushSubscriptions.removeByEndpoint, {
    endpoint: args.endpoint,
  });
  expect(
    await t.query(api.pushSubscriptions.isSubscribed, {
      babyId: created.babyId,
      endpoint: args.endpoint,
    }),
  ).toBe(false);

  await asAlice.mutation(api.baby.remove, { babyId: created.babyId });
  await expect(
    t.mutation(api.pushSubscriptions.subscribe, {
      ...args,
      endpoint: "https://push.example/deleted",
    }),
  ).rejects.toThrow("Baby not found");
});

test("managers can opt into message alerts without changing the family subscriber count", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const asBob = t.withIdentity({ subject: "bob" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Owner Push Baby",
    }),
  );
  const ownerArgs = {
    auth: "owner-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/owner",
    p256dh: "owner-key",
    userAgent: TEST_USER_AGENT,
  };

  await expect(t.mutation(api.pushSubscriptions.subscribeAsOwner, ownerArgs)).rejects.toThrow(
    "Not authenticated",
  );
  await expect(asBob.mutation(api.pushSubscriptions.subscribeAsOwner, ownerArgs)).rejects.toThrow(
    "Not authorized",
  );

  const subscriptionId = await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, ownerArgs);
  expect(
    await asAlice.query(api.pushSubscriptions.getSubscriptionCount, {
      babyId: created.babyId,
    }),
  ).toBe(0);
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: ownerArgs.endpoint,
    }),
  ).toBe(true);
  expect(
    await t.query(api.pushSubscriptions.isSubscribed, {
      babyId: created.babyId,
      endpoint: ownerArgs.endpoint,
    }),
  ).toBe(false);

  const familyPage = await t.query(internal.pushSubscriptions.getSubscriptionsPage, {
    babyId: created.babyId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(familyPage.page).toEqual([]);
  const ownerPage = await t.query(internal.pushSubscriptions.getOwnerSubscriptionsPage, {
    babyId: created.babyId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(ownerPage.page).toMatchObject([{ _id: subscriptionId, endpoint: ownerArgs.endpoint }]);

  const rotatedId = await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, {
    ...ownerArgs,
    auth: "rotated-owner-secret",
    p256dh: "rotated-owner-key",
  });
  expect(rotatedId).toBe(subscriptionId);
  const rotatedOwnerPage = await t.query(internal.pushSubscriptions.getOwnerSubscriptionsPage, {
    babyId: created.babyId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(rotatedOwnerPage.page).toMatchObject([
    { auth: "rotated-owner-secret", p256dh: "rotated-owner-key" },
  ]);

  await asAlice.mutation(api.pushSubscriptions.unsubscribeAsOwner, {
    auth: "wrong-secret",
    babyId: created.babyId,
    endpoint: ownerArgs.endpoint,
    p256dh: "wrong-key",
  });
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: ownerArgs.endpoint,
    }),
  ).toBe(true);

  await asAlice.mutation(api.pushSubscriptions.unsubscribeAsOwner, {
    auth: "rotated-owner-secret",
    babyId: created.babyId,
    endpoint: ownerArgs.endpoint,
    p256dh: "rotated-owner-key",
  });
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: ownerArgs.endpoint,
    }),
  ).toBe(false);
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.publicId,
      endpoint: ownerArgs.endpoint,
    }),
  ).toBe(false);
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: "missing-baby",
      endpoint: ownerArgs.endpoint,
    }),
  ).toBe(false);
});

test("removeByEndpoint clears owner message subscriptions for that browser", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Owner Endpoint Baby",
    }),
  );
  await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "owner-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/shared-endpoint",
    p256dh: "owner-key",
    userAgent: TEST_USER_AGENT,
  });

  await t.mutation(internal.pushSubscriptions.removeByEndpoint, {
    endpoint: "https://push.example/shared-endpoint",
  });
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/shared-endpoint",
    }),
  ).toBe(false);
});
