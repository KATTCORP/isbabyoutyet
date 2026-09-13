import sharp from "sharp";

/** Square crop used on the baby page and timeline. */
export const PAGE_THUMBNAIL = { width: 900, height: 900 } as const;

/**
 * Chromium `Notification.image` (Chrome on Android / Windows). iOS Safari
 * ignores `image`, so the same payload is safe to send everywhere.
 *
 * Android expanded “big picture” is ~450dp wide; at 3× that is 1350px.
 * Chromium crops to ~2:1, so we ship 1350×675 JPEG and keep the subject in
 * the center. Keep the file small (typically well under 200KB) — the image
 * is fetched on the notification’s critical path.
 */
export const PUSH_IMAGE = { width: 1350, height: 675 } as const;

/**
 * Tiny square JPEG inlined as a `data:` URL (Next.js `blurDataURL`).
 * The page thumbnail is the same center-cover crop, so the placeholder
 * matches the inline photo while CSS blurs it up.
 */
export const BLUR_PLACEHOLDER = { width: 8, height: 8 } as const;

const PAGE_CROP = { fit: "cover", position: "center" } as const;

export async function renderPageThumbnail(bytes: Buffer) {
  return await sharp(bytes)
    .rotate()
    .resize(PAGE_THUMBNAIL.width, PAGE_THUMBNAIL.height, PAGE_CROP)
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function renderBlurDataUrl(bytes: Buffer) {
  const jpeg = await sharp(bytes)
    .rotate()
    .resize(BLUR_PLACEHOLDER.width, BLUR_PLACEHOLDER.height, PAGE_CROP)
    .jpeg({ quality: 40 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function renderPushImage(bytes: Buffer) {
  return await sharp(bytes)
    .rotate()
    .resize(PUSH_IMAGE.width, PUSH_IMAGE.height, {
      fit: "cover",
      position: "center",
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}
