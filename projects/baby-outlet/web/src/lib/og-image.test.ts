import { expect, test } from "vitest";
import { createHomepageOgImage, createBabyOgImage } from "@/lib/og-image";

test("homepage OG image returns a PNG response", async () => {
  const response = await createHomepageOgImage("en-GB");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // PNG magic number
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}, 30_000);

test("baby OG image includes status-aware card as PNG", async () => {
  const response = await createBabyOgImage({
    name: "Juniper",
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    theme: "sunny-days",
    locale: "en-GB",
    babyBorn: null,
    wentToHospital: null,
    laborStarted: null,
    photoUrl: null,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.byteLength).toBeGreaterThan(5_000);
}, 30_000);
