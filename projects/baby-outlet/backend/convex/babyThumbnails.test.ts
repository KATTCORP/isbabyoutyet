import { convexTest } from "convex-test";
import sharp from "sharp";
import { expect, test } from "vitest";
import {
  BLUR_PLACEHOLDER,
  PUSH_IMAGE,
  renderBlurDataUrl,
  renderPageThumbnail,
  renderPushImage,
} from "../src/photoDerivatives";
import {
  generateBlurDataUrlsForExistingBabyPhotosDoc,
  generateBlurDataUrlsForExistingPhotosDoc,
  generatePushImagesForExistingPhotosDoc,
} from "./migrations";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs } from "./test.setup";

async function jpegBytes(opts: {
  background?: { b: number; g: number; r: number };
  height: number;
  width: number;
}) {
  return await sharp({
    create: {
      background: opts.background ?? { b: 40, g: 80, r: 200 },
      channels: 3,
      height: opts.height,
      width: opts.width,
    },
  })
    .jpeg()
    .toBuffer();
}

test("push images are 1350×675 JPEGs under 200KB (Android big-picture at 3×)", async () => {
  const source = await jpegBytes({ height: 3000, width: 2000 });
  const rendered = await renderPushImage(source);
  const meta = await sharp(rendered).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBe(PUSH_IMAGE.width);
  expect(meta.height).toBe(PUSH_IMAGE.height);
  expect(rendered.byteLength).toBeLessThan(200_000);

  const page = await sharp(await renderPageThumbnail(source)).metadata();
  expect(page.width).toBe(900);
  expect(page.height).toBe(900);
});

test("blur placeholders are tiny JPEG data URLs of the same center-cover crop", async () => {
  const source = await jpegBytes({ height: 3000, width: 2000 });
  const blurDataUrl = await renderBlurDataUrl(source);
  expect(blurDataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect(blurDataUrl.length).toBeLessThan(1500);

  const jpeg = Buffer.from(blurDataUrl.slice("data:image/jpeg;base64,".length), "base64");
  const meta = await sharp(jpeg).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBe(BLUR_PLACEHOLDER.width);
  expect(meta.height).toBe(BLUR_PLACEHOLDER.height);

  const red = await renderBlurDataUrl(
    await jpegBytes({ background: { b: 30, g: 30, r: 220 }, height: 64, width: 64 }),
  );
  const blue = await renderBlurDataUrl(
    await jpegBytes({ background: { b: 220, g: 30, r: 30 }, height: 64, width: 64 }),
  );
  expect(red).not.toBe(blue);
});

test("generateThumbnail stores a blur data URL on the baby and update", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Blur Baby",
    }),
  );

  const source = await jpegBytes({ height: 600, width: 400 });
  const photoId = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));
  });
  const updateId = await t.run(async (ctx) => {
    await ctx.db.patch(created.babyId, { photoId });
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      photoId,
      postedByUserId: "alice",
      timelineItemId,
    });
  });

  await t.action(internal.babyThumbnails.generateThumbnail, {
    babyId: created.babyId,
    photoId,
    updateId,
  });

  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(baby?.blurDataUrl?.startsWith("data:image/jpeg;base64,")).toBe(true);

  const feed = await t.query(api.timeline.listByBaby, {
    babyId: created.babyId,
    paginationOpts: { cursor: null, numItems: 20 },
    visitorId: null,
  });
  const photoItem = feed.page.find((item) => item.kind === "update");
  expect(photoItem?.kind === "update" && photoItem.update.blurDataUrl).toBe(baby?.blurDataUrl);
});

test("generateBlurDataUrl writes the placeholder without requiring a thumbnail", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Blur Only Baby",
    }),
  );

  const source = await jpegBytes({ height: 200, width: 200 });
  const photoId = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(created.babyId, { photoId });
  });

  const blurDataUrl = await t.action(internal.babyThumbnails.generateBlurDataUrl, {
    babyId: created.babyId,
    photoId,
    updateId: null,
  });
  expect(blurDataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);

  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(baby?.blurDataUrl).toBe(blurDataUrl);
});

test("updateBlurDataUrl ignores stale generation after the photo changes", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Stale Blur Baby",
    }),
  );
  const photoA = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["a"], { type: "image/jpeg" }));
  });
  const photoB = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["b"], { type: "image/jpeg" }));
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(created.babyId, { photoId: photoB });
  });

  await t.mutation(internal.baby.updateBlurDataUrl, {
    babyId: created.babyId,
    blurDataUrl: "data:image/jpeg;base64,stale",
    photoId: photoA,
    updateId: null,
  });
  const ignored = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(ignored?.blurDataUrl ?? null).toBeNull();

  await t.mutation(internal.baby.updateBlurDataUrl, {
    babyId: created.babyId,
    blurDataUrl: "data:image/jpeg;base64,fresh",
    photoId: photoB,
    updateId: null,
  });
  const applied = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(applied?.blurDataUrl).toBe("data:image/jpeg;base64,fresh");
});

test("send prefers the push image, then the page thumbnail, then the original", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Push Image Baby",
    }),
  );

  const original = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["original"], { type: "image/jpeg" }));
  });
  const thumbnail = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["thumb"], { type: "image/jpeg" }));
  });
  const pushImage = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["push-image"], { type: "image/jpeg" }));
  });
  const updateId = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      photoId: original,
      postedByUserId: "alice",
      timelineItemId,
    });
  });

  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      photoId: original,
      updateId,
    }),
  ).toBe(original);

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    blurDataUrl: null,
    photoId: original,
    pushImageId: null,
    thumbnailId: thumbnail,
    updateId,
  });
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      photoId: original,
      updateId,
    }),
  ).toBe(thumbnail);

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    blurDataUrl: null,
    photoId: original,
    pushImageId: pushImage,
    thumbnailId: thumbnail,
    updateId,
  });
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      photoId: original,
      updateId,
    }),
  ).toBe(pushImage);
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      photoId: original,
      updateId: null,
    }),
  ).toBe(original);

  await t.run(async (ctx) => {
    await ctx.db.delete(updateId);
  });
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      photoId: original,
      updateId,
    }),
  ).toBe(original);
});

test("push image backfill only schedules photo updates that still need a derivative", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Backfill Baby",
    }),
  );
  const source = await jpegBytes({ height: 64, width: 64 });
  const photo = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));
  });
  const pushImage = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["push"], { type: "image/jpeg" }));
  });

  const alreadyDone = await t.run(async (ctx) => {
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
  const deleted = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      deletedAt: Date.now(),
      photoId: photo,
      timelineItemId,
    });
  });
  const messageOnly = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      message: "No photo",
      timelineItemId,
    });
  });
  const needsPushImage = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      photoId: photo,
      timelineItemId,
    });
  });

  await t.run(async (ctx) => {
    const done = await ctx.db.get(alreadyDone);
    const gone = await ctx.db.get(deleted);
    const text = await ctx.db.get(messageOnly);
    const needs = await ctx.db.get(needsPushImage);
    if (!done || !gone || !text || !needs) {
      throw new Error("expected fixture updates");
    }
    expect(await generatePushImagesForExistingPhotosDoc(ctx, done)).toBeUndefined();
    expect(await generatePushImagesForExistingPhotosDoc(ctx, gone)).toBeUndefined();
    expect(await generatePushImagesForExistingPhotosDoc(ctx, text)).toBeUndefined();
    expect(await generatePushImagesForExistingPhotosDoc(ctx, needs)).toBeUndefined();
  });
});

test("blur data URL backfill only schedules photo updates that still need a placeholder", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Blur Backfill Baby",
    }),
  );
  const source = await jpegBytes({ height: 64, width: 64 });
  const photo = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));
  });

  const alreadyDone = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      blurDataUrl: "data:image/jpeg;base64,already",
      photoId: photo,
      timelineItemId,
    });
  });
  const deleted = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      deletedAt: Date.now(),
      photoId: photo,
      timelineItemId,
    });
  });
  const messageOnly = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      message: "No photo",
      timelineItemId,
    });
  });
  const needsBlur = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      photoId: photo,
      timelineItemId,
    });
  });

  await t.run(async (ctx) => {
    const done = await ctx.db.get(alreadyDone);
    const gone = await ctx.db.get(deleted);
    const text = await ctx.db.get(messageOnly);
    const needs = await ctx.db.get(needsBlur);
    if (!done || !gone || !text || !needs) {
      throw new Error("expected fixture updates");
    }
    expect(await generateBlurDataUrlsForExistingPhotosDoc(ctx, done)).toBeUndefined();
    expect(await generateBlurDataUrlsForExistingPhotosDoc(ctx, gone)).toBeUndefined();
    expect(await generateBlurDataUrlsForExistingPhotosDoc(ctx, text)).toBeUndefined();
    expect(await generateBlurDataUrlsForExistingPhotosDoc(ctx, needs)).toBeUndefined();
  });
});

test("baby photo blur backfill only schedules babies that still need a placeholder", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Photo Blur",
    }),
  );
  const source = await jpegBytes({ height: 64, width: 64 });
  const photo = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));
  });

  await t.run(async (ctx) => {
    const noPhoto = await ctx.db.get(created.babyId);
    if (!noPhoto) {
      throw new Error("expected fixture baby");
    }
    expect(await generateBlurDataUrlsForExistingBabyPhotosDoc(ctx, noPhoto)).toBeUndefined();

    await ctx.db.patch(created.babyId, { deletedAt: Date.now(), photoId: photo });
    const deleted = await ctx.db.get(created.babyId);
    if (!deleted) {
      throw new Error("expected deleted baby");
    }
    expect(await generateBlurDataUrlsForExistingBabyPhotosDoc(ctx, deleted)).toBeUndefined();

    await ctx.db.patch(created.babyId, {
      blurDataUrl: "data:image/jpeg;base64,already",
      deletedAt: null,
    });
    const done = await ctx.db.get(created.babyId);
    if (!done) {
      throw new Error("expected backfilled baby");
    }
    expect(await generateBlurDataUrlsForExistingBabyPhotosDoc(ctx, done)).toBeUndefined();

    await ctx.db.patch(created.babyId, { blurDataUrl: null });
    const needs = await ctx.db.get(created.babyId);
    if (!needs) {
      throw new Error("expected baby needing a placeholder");
    }
    expect(await generateBlurDataUrlsForExistingBabyPhotosDoc(ctx, needs)).toBeUndefined();
  });
});

test("updateThumbnail ignores stale generation after the photo changes", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Stale Thumb Baby",
    }),
  );
  const photoA = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["a"], { type: "image/jpeg" }));
  });
  const photoB = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["b"], { type: "image/jpeg" }));
  });
  const thumbA = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["ta"], { type: "image/jpeg" }));
  });
  const thumbB = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["tb"], { type: "image/jpeg" }));
  });
  const pushB = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["pb"], { type: "image/jpeg" }));
  });
  const updateId = await t.run(async (ctx) => {
    await ctx.db.patch(created.babyId, { photoId: photoB });
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      photoId: photoB,
      timelineItemId,
    });
  });

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    blurDataUrl: null,
    photoId: photoA,
    pushImageId: null,
    thumbnailId: thumbA,
    updateId,
  });
  const ignored = await t.run(async (ctx) => {
    const baby = await ctx.db.get(created.babyId);
    const update = await ctx.db.get(updateId);
    return { babyThumbnailId: baby?.thumbnailId, updateThumbnailId: update?.thumbnailId };
  });
  expect(ignored.babyThumbnailId ?? null).toBeNull();
  expect(ignored.updateThumbnailId ?? null).toBeNull();

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    blurDataUrl: null,
    photoId: photoB,
    pushImageId: pushB,
    thumbnailId: thumbB,
    updateId,
  });
  const applied = await t.run(async (ctx) => {
    const baby = await ctx.db.get(created.babyId);
    const update = await ctx.db.get(updateId);
    return {
      babyThumbnailId: baby?.thumbnailId,
      pushImageId: update?.pushImageId,
      updateThumbnailId: update?.thumbnailId,
    };
  });
  expect(applied).toMatchObject({
    babyThumbnailId: thumbB,
    pushImageId: pushB,
    updateThumbnailId: thumbB,
  });
});
