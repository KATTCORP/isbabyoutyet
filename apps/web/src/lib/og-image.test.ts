import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { isString } from "@workspace/runtime/guards";
import {
  FONT_CACHE_MAX_ENTRIES,
  createHomepageOgImage,
  createBabyOgImage,
  loadNunitoFont,
} from "@/lib/og-image";

const TEST_FONT_URL = "https://fonts.gstatic.com/s/test.ttf";
const MISSING_PHOTO_URL = "https://cdn.example/missing.jpg";
const THROW_PHOTO_URL = "https://cdn.example/throw.jpg";

function requestUrl(input: RequestInfo | URL) {
  if (isString(input)) {
    return input;
  }
  if ("url" in input) {
    return input.url;
  }
  return input.href;
}

async function stubOgImageFonts() {
  // Local TTF so these tests do not fetch Google Fonts (and do not need a
  // raised Vitest timeout).
  const fontBytes = await readFile(join(import.meta.dirname, "og-image.test.font.ttf"));
  const originalFetch = globalThis.fetch;
  const fontFileRequests = vi.fn<() => void>();
  const fetchStub: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.includes("fonts.googleapis.com")) {
      return new Response(`@font-face { src: url(${TEST_FONT_URL}); }`);
    }
    if (url === TEST_FONT_URL) {
      fontFileRequests();
      return new Response(fontBytes);
    }
    if (url === MISSING_PHOTO_URL) {
      return new Response("missing", { status: 404 });
    }
    if (url === THROW_PHOTO_URL) {
      throw new Error("photo fetch failed");
    }
    return originalFetch(input, init);
  };
  vi.stubGlobal("fetch", fetchStub);
  return makeResource({ fontFileRequests }, () => {
    vi.unstubAllGlobals();
  });
}

test("font cache is shared per glyph text but bounded and least-recently-used", async () => {
  await using fonts = await stubOgImageFonts();
  // Unique texts so this test never collides with entries other tests warmed.
  const text = (index: number) => `lru-${Math.random()}-${index}`;
  const first = text(0);

  await loadNunitoFont({ text: first, weight: 700 });
  await loadNunitoFont({ text: first, weight: 700 });
  expect(fonts.fontFileRequests).toHaveBeenCalledTimes(1);

  // Fill the cache with other entries, touching `first` midway to keep it hot.
  for (let index = 1; index < FONT_CACHE_MAX_ENTRIES; index += 1) {
    await loadNunitoFont({ text: text(index), weight: 700 });
  }
  await loadNunitoFont({ text: first, weight: 700 });
  expect(fonts.fontFileRequests).toHaveBeenCalledTimes(FONT_CACHE_MAX_ENTRIES);

  // One more distinct entry evicts the least recently used one — not `first`.
  await loadNunitoFont({ text: text(FONT_CACHE_MAX_ENTRIES), weight: 700 });
  await loadNunitoFont({ text: first, weight: 700 });
  expect(fonts.fontFileRequests).toHaveBeenCalledTimes(FONT_CACHE_MAX_ENTRIES + 1);

  // Push `first` out by filling the cache with fresh entries; it refetches.
  for (let index = 0; index < FONT_CACHE_MAX_ENTRIES; index += 1) {
    await loadNunitoFont({ text: text(1000 + index), weight: 700 });
  }
  await loadNunitoFont({ text: first, weight: 700 });
  expect(fonts.fontFileRequests).toHaveBeenCalledTimes(FONT_CACHE_MAX_ENTRIES * 2 + 2);
});

test("homepage OG image returns a PNG response", async () => {
  await using _fonts = await stubOgImageFonts();
  const response = await createHomepageOgImage("en-GB");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  expect(response.headers.get("cache-control")).toBeNull();
  const bytes = new Uint8Array(await response.arrayBuffer());
  // PNG magic number
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test("baby OG image includes status-aware card as PNG", async () => {
  await using _fonts = await stubOgImageFonts();
  const response = await createBabyOgImage({
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    laborStarted: null,
    locale: "en-GB",
    name: "Juniper",
    photoUrl: null,
    theme: "sunny-days",
    timeZone: undefined,
    wentToHospital: null,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  expect(response.headers.get("cache-control")).toBeNull();
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.byteLength).toBeGreaterThan(5000);
});

test("baby OG image renders message-mode due date copy as PNG", async () => {
  await using _fonts = await stubOgImageFonts();
  const response = await createBabyOgImage({
    babyBorn: null,
    dueDateDisplayMode: "message",
    laborStarted: null,
    locale: "en-GB",
    name: "Nova",
    photoUrl: null,
    publicDueDateText: "Any day now",
    theme: "sunny-days",
    timeZone: undefined,
    wentToHospital: null,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.byteLength).toBeGreaterThan(5000);
});

test("baby OG image still renders when the photo cannot be fetched", async () => {
  await using _fonts = await stubOgImageFonts();
  const missing = await createBabyOgImage({
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    laborStarted: null,
    locale: "en-GB",
    name: "Juniper",
    photoUrl: MISSING_PHOTO_URL,
    theme: "sunny-days",
    timeZone: undefined,
    wentToHospital: null,
  });
  expect(missing.status).toBe(200);
  expect(Array.from(new Uint8Array(await missing.arrayBuffer()).slice(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  const thrown = await createBabyOgImage({
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    laborStarted: null,
    locale: "en-GB",
    name: "Juniper",
    photoUrl: THROW_PHOTO_URL,
    theme: "sunny-days",
    timeZone: undefined,
    wentToHospital: null,
  });
  expect(thrown.status).toBe(200);
  expect(Array.from(new Uint8Array(await thrown.arrayBuffer()).slice(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
});
