import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";
import { z } from "zod";

const publicDir = join(import.meta.dirname, "../../public");

const webAppManifestSchema = z.object({
  display: z.literal("standalone"),
  icons: z.array(
    z.object({
      sizes: z.string(),
      src: z.string(),
    }),
  ),
  name: z.literal("Sous Vide Guide"),
  short_name: z.literal("Sous Vide"),
  start_url: z.literal("/"),
});

function readPngSize(path: string) {
  const png = readFileSync(path);
  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  };
}

test("web app manifest meets Chromium installability fields", () => {
  const raw: unknown = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"));
  const manifest = webAppManifestSchema.parse(raw);

  const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
  expect(sizes.has("192x192")).toBe(true);
  expect(sizes.has("512x512")).toBe(true);

  expect(readPngSize(join(publicDir, "android-chrome-192x192.png"))).toEqual({
    height: 192,
    width: 192,
  });
  expect(readPngSize(join(publicDir, "android-chrome-512x512.png"))).toEqual({
    height: 512,
    width: 512,
  });
});
