"use node";

import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderBlurDataUrl, renderPageThumbnail, renderPushImage } from "../src/photoDerivatives";

function jpegBlob(bytes: Buffer) {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

async function photoBuffer(ctx: ActionCtx, photoId: Id<"_storage">) {
  const imageBlob = await ctx.storage.get(photoId);
  if (!imageBlob) {
    throw new Error("Photo not found in storage");
  }
  return Buffer.from(await imageBlob.arrayBuffer());
}

// Generate page thumbnail + push-notification image from a photo storage ID.
export const generateThumbnail = internalAction({
  args: {
    babyId: v.id("baby"),
    photoId: v.id("_storage"),
    updateId: v.optional(v.id("updates")),
  },
  handler: async (ctx: ActionCtx, args) => {
    const buffer = await photoBuffer(ctx, args.photoId);
    const thumbnailId = await ctx.storage.store(jpegBlob(await renderPageThumbnail(buffer)));
    const pushImageId = args.updateId
      ? await ctx.storage.store(jpegBlob(await renderPushImage(buffer)))
      : null;
    const blurDataUrl = await renderBlurDataUrl(buffer);

    await ctx.runMutation(internal.baby.updateThumbnail, {
      babyId: args.babyId,
      thumbnailId,
      photoId: args.photoId,
      updateId: args.updateId,
      pushImageId,
      blurDataUrl,
    });

    return thumbnailId;
  },
});

/**
 * Backfill-only: write the inline blur placeholder without regenerating the
 * larger page/push derivatives (those already exist on historical photos).
 */
export const generateBlurDataUrl = internalAction({
  args: {
    babyId: v.id("baby"),
    photoId: v.id("_storage"),
    updateId: v.optional(v.id("updates")),
  },
  handler: async (ctx: ActionCtx, args) => {
    const blurDataUrl = await renderBlurDataUrl(await photoBuffer(ctx, args.photoId));
    await ctx.runMutation(internal.baby.updateBlurDataUrl, {
      babyId: args.babyId,
      photoId: args.photoId,
      updateId: args.updateId,
      blurDataUrl,
    });
    return blurDataUrl;
  },
});
