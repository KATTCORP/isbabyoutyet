import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs, createEncouragementArgs } from "./test.setup";

test("sending a photo notification resolves the image URL and marks the job sent", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );

  const photo = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["fake image bytes"], { type: "image/jpeg" }));
  });
  const pushImage = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["push image bytes"], { type: "image/jpeg" }));
  });
  const updateId = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      photoId: photo,
      pushImageId: pushImage,
      timelineItemId,
    });
  });

  await t.mutation(api.pushSubscriptions.subscribe, {
    auth: "private-auth-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/photo-sub",
    p256dh: "public-key",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  });

  const notificationId = await t.run(async (ctx) => {
    return await ctx.db.insert("scheduledNotifications", {
      babyId: created.babyId,
      createdAt: Date.now(),
      customMessage: null,
      notificationType: "photo_added",
      photoId: photo,
      scheduledFor: Date.now(),
      status: "pending",
      updateId,
    });
  });

  await t.action(internal.pushNotifications.sendNotification, {
    babyId: created.babyId,
    babyName: "Baby Smith",
    customMessage: null,
    locale: "en-GB",
    notificationId,
    photoId: photo,
    publicId: created.publicId,
    status: "photo_added",
    updateId,
  });

  const notifications = await asAlice.query(api.baby.getScheduledNotifications, {
    babyId: created.babyId,
  });
  expect(notifications).toMatchObject([
    { notificationType: "photo_added", photoId: photo, status: "sent" },
  ]);
});

test("owner message notifications page manager subscriptions without marking family jobs", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );
  await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "private-auth-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/owner-sub",
    p256dh: "public-key",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  });

  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId: created.babyId,
      message: "Hello from the waiting room",
      visitorId: "visitor-1",
    }),
  );

  await t.action(internal.pushNotifications.sendOwnerMessageNotification, {
    authorName: "Grandma",
    babyId: created.babyId,
    babyName: "Baby Smith",
    encouragementId,
    event: "created",
    locale: "en-GB",
    message: "Hello from the waiting room",
    publicId: created.publicId,
  });

  expect(
    await asAlice.query(api.baby.getScheduledNotifications, {
      babyId: created.babyId,
    }),
  ).toEqual([]);
  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/owner-sub",
    }),
  ).toBe(true);
});

test("dismissing an owner message push pages the same manager subscriptions", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );
  await asAlice.mutation(api.pushSubscriptions.subscribeAsOwner, {
    auth: "private-auth-secret",
    babyId: created.babyId,
    endpoint: "https://push.example/owner-sub",
    p256dh: "public-key",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  });
  const encouragementId = await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Grandma",
      babyId: created.babyId,
      message: "Please ignore this",
      visitorId: "visitor-1",
    }),
  );

  await t.action(internal.pushNotifications.dismissOwnerMessageNotification, {
    babyId: created.babyId,
    encouragementId,
  });

  expect(
    await t.query(api.pushSubscriptions.isOwnerSubscribed, {
      babyId: created.babyId,
      endpoint: "https://push.example/owner-sub",
    }),
  ).toBe(true);
});
