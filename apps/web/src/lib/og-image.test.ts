import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { isString } from "@workspace/runtime/guards";
import { createHomepageOgImage, createBabyOgImage, textForOgImage } from "@/lib/og-image";

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
  const googleFontUrls: Array<string> = [];
  const originalFetch = globalThis.fetch;
  const fetchStub: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.includes("fonts.googleapis.com")) {
      googleFontUrls.push(url);
      return new Response(`@font-face { src: url(${TEST_FONT_URL}); }`);
    }
    if (url === TEST_FONT_URL) {
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
  return makeResource({ googleFontUrls }, () => {
    vi.unstubAllGlobals();
  });
}

test("textForOgImage strips emoji and normalizes whitespace", () => {
  expect(textForOgImage("Baby Name 🌻")).toBe("Baby Name");
  expect(textForOgImage("🌺Mia🌺")).toBe("Mia");
  expect(textForOgImage("Baby 👨‍👩‍👧")).toBe("Baby");
  expect(textForOgImage("Baby 👍🏽")).toBe("Baby");
  expect(textForOgImage("Hello 1️⃣ world")).toBe("Hello 1 world");
  expect(textForOgImage("  spaced   name  ")).toBe("spaced name");
});

test("textForOgImage keeps letters that Nunito can draw", () => {
  expect(textForOgImage("José")).toBe("José");
  expect(textForOgImage("Är bäbisen")).toBe("Är bäbisen");
  expect(textForOgImage("Maria")).toBe("Maria");
});

test("textForOgImage returns empty when only emoji remain", () => {
  expect(textForOgImage("👶")).toBe("");
  expect(textForOgImage("🌻🌺")).toBe("");
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

test("baby OG image strips emoji from the name before rendering", async () => {
  await using fonts = await stubOgImageFonts();
  const response = await createBabyOgImage({
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    laborStarted: null,
    locale: "en-GB",
    name: "River 🌻",
    photoUrl: null,
    theme: "sunny-days",
    timeZone: undefined,
    wentToHospital: null,
  });
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(fonts.googleFontUrls.length).toBeGreaterThan(0);
  for (const url of fonts.googleFontUrls) {
    const textParam = new URL(url).searchParams.get("text") ?? "";
    expect(textParam).toContain("River");
    expect(textParam).not.toContain("🌻");
  }
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

test("baby OG image strips emoji from message-mode due date copy", async () => {
  await using fonts = await stubOgImageFonts();
  const response = await createBabyOgImage({
    babyBorn: null,
    dueDateDisplayMode: "message",
    laborStarted: null,
    locale: "en-GB",
    name: "Nova",
    photoUrl: null,
    publicDueDateText: "Due any moment 🎉",
    theme: "sunny-days",
    timeZone: undefined,
    wentToHospital: null,
  });
  expect(response.status).toBe(200);
  expect(fonts.googleFontUrls.length).toBeGreaterThan(0);
  for (const url of fonts.googleFontUrls) {
    const textParam = new URL(url).searchParams.get("text") ?? "";
    expect(textParam).toContain("Due any moment");
    expect(textParam).not.toContain("🎉");
  }
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
