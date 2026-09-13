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
  generateBlurDataUrlsForExistingPhotosDoc,
  generatePushImagesForExistingPhotosDoc,
} from "./migrations";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";

async function jpegBytes(opts: {
  width: number;
  height: number;
  background?: { r: number; g: number; b: number };
}) {
  return await sharp({
    create: {
      width: opts.width,
      height: opts.height,
      channels: 3,
      background: opts.background ?? { r: 200, g: 80, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

test("push images are 1350×675 JPEGs under 200KB (Android big-picture at 3×)", async () => {
  const source = await jpegBytes({ width: 2000, height: 3000 });
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
  const source = await jpegBytes({ width: 2000, height: 3000 });
  const blurDataUrl = await renderBlurDataUrl(source);
  expect(blurDataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect(blurDataUrl.length).toBeLessThan(1_500);

  const jpeg = Buffer.from(blurDataUrl.slice("data:image/jpeg;base64,".length), "base64");
  const meta = await sharp(jpeg).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBe(BLUR_PLACEHOLDER.width);
  expect(meta.height).toBe(BLUR_PLACEHOLDER.height);

  const red = await renderBlurDataUrl(
    await jpegBytes({ width: 64, height: 64, background: { r: 220, g: 30, b: 30 } }),
  );
  const blue = await renderBlurDataUrl(
    await jpegBytes({ width: 64, height: 64, background: { r: 30, g: 30, b: 220 } }),
  );
  expect(red).not.toBe(blue);
});

test("generateThumbnail stores a blur data URL on the baby and update", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Blur Baby",
    dueDate: "2026-09-01",
  });

  const source = await jpegBytes({ width: 400, height: 600 });
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
      timelineItemId,
      photoId,
      postedByUserId: "alice",
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
    paginationOpts: { numItems: 20, cursor: null },
  });
  const photoItem = feed.page.find((item) => item.kind === "update");
  expect(photoItem?.kind === "update" && photoItem.update.blurDataUrl).toBe(baby?.blurDataUrl);
});

test("generateBlurDataUrl writes the placeholder without requiring a thumbnail", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Blur Only Baby",
    dueDate: "2026-09-01",
  });

  const source = await jpegBytes({ width: 200, height: 200 });
  const photoId = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(source)], { type: "image/jpeg" }));
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(created.babyId, { photoId });
  });

  const blurDataUrl = await t.action(internal.babyThumbnails.generateBlurDataUrl, {
    babyId: created.babyId,
    photoId,
  });
  expect(blurDataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);

  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(baby?.blurDataUrl).toBe(blurDataUrl);
});

test("updateBlurDataUrl ignores stale generation after the photo changes", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Stale Blur Baby",
    dueDate: "2026-09-01",
  });
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
    photoId: photoA,
    blurDataUrl: "data:image/jpeg;base64,stale",
  });
  const ignored = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(ignored?.blurDataUrl ?? null).toBeNull();

  await t.mutation(internal.baby.updateBlurDataUrl, {
    babyId: created.babyId,
    photoId: photoB,
    blurDataUrl: "data:image/jpeg;base64,fresh",
  });
  const applied = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(applied?.blurDataUrl).toBe("data:image/jpeg;base64,fresh");
});

test("send prefers the push image, then the page thumbnail, then the original", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Push Image Baby",
    dueDate: "2026-09-01",
  });

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
      timelineItemId,
      photoId: original,
      postedByUserId: "alice",
    });
  });

  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      updateId,
      photoId: original,
    }),
  ).toBe(original);

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    thumbnailId: thumbnail,
    pushImageId: null,
    photoId: original,
    updateId,
  });
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      updateId,
      photoId: original,
    }),
  ).toBe(thumbnail);

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    thumbnailId: thumbnail,
    pushImageId: pushImage,
    photoId: original,
    updateId,
  });
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      updateId,
      photoId: original,
    }),
  ).toBe(pushImage);
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      updateId: null,
      photoId: original,
    }),
  ).toBe(original);

  await t.run(async (ctx) => {
    await ctx.db.delete(updateId);
  });
  expect(
    await t.query(internal.baby.resolveNotificationImage, {
      updateId,
      photoId: original,
    }),
  ).toBe(original);
});

test("push image backfill only schedules photo updates that still need a derivative", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Backfill Baby",
    dueDate: "2026-09-01",
  });
  const photo = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" }));
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
      timelineItemId,
      photoId: photo,
      pushImageId: pushImage,
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
      timelineItemId,
      photoId: photo,
      deletedAt: Date.now(),
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
      timelineItemId,
      message: "No photo",
    });
  });

  await t.run(async (ctx) => {
    const done = await ctx.db.get(alreadyDone);
    const gone = await ctx.db.get(deleted);
    const text = await ctx.db.get(messageOnly);
    if (!done || !gone || !text) throw new Error("expected fixture updates");
    await generatePushImagesForExistingPhotosDoc(ctx, done);
    await generatePushImagesForExistingPhotosDoc(ctx, gone);
    await generatePushImagesForExistingPhotosDoc(ctx, text);
  });
});

test("blur data URL backfill only schedules photo updates that still need a placeholder", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Blur Backfill Baby",
    dueDate: "2026-09-01",
  });
  const photo = await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" }));
  });

  const alreadyDone = await t.run(async (ctx) => {
    const timelineItemId = await ctx.db.insert("timelineItems", {
      babyId: created.babyId,
      kind: "update",
      postedAt: Date.now(),
    });
    return await ctx.db.insert("updates", {
      babyId: created.babyId,
      timelineItemId,
      photoId: photo,
      blurDataUrl: "data:image/jpeg;base64,already",
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
      timelineItemId,
      photoId: photo,
      deletedAt: Date.now(),
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
      timelineItemId,
      message: "No photo",
    });
  });

  await t.run(async (ctx) => {
    const done = await ctx.db.get(alreadyDone);
    const gone = await ctx.db.get(deleted);
    const text = await ctx.db.get(messageOnly);
    if (!done || !gone || !text) throw new Error("expected fixture updates");
    await generateBlurDataUrlsForExistingPhotosDoc(ctx, done);
    await generateBlurDataUrlsForExistingPhotosDoc(ctx, gone);
    await generateBlurDataUrlsForExistingPhotosDoc(ctx, text);
  });
});

test("updateThumbnail ignores stale generation after the photo changes", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Stale Thumb Baby",
    dueDate: "2026-09-01",
  });
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
      timelineItemId,
      photoId: photoB,
    });
  });

  await t.mutation(internal.baby.updateThumbnail, {
    babyId: created.babyId,
    thumbnailId: thumbA,
    pushImageId: null,
    photoId: photoA,
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
    thumbnailId: thumbB,
    pushImageId: pushB,
    photoId: photoB,
    updateId,
  });
  const applied = await t.run(async (ctx) => {
    const baby = await ctx.db.get(created.babyId);
    const update = await ctx.db.get(updateId);
    return {
      babyThumbnailId: baby?.thumbnailId,
      updateThumbnailId: update?.thumbnailId,
      pushImageId: update?.pushImageId,
    };
  });
  expect(applied).toMatchObject({
    babyThumbnailId: thumbB,
    updateThumbnailId: thumbB,
    pushImageId: pushB,
  });
});
