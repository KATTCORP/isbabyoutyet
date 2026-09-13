import { expect, test } from "vitest";
import { resolveAuthBaseUrl } from "./auth";

test("auth base URL prefers the web origin after preview env sync", () => {
  expect(resolveAuthBaseUrl("https://preview.example", "https://convex.example")).toBe(
    "https://preview.example",
  );
});

test("auth base URL falls back to the Convex origin during preview bootstrap", () => {
  expect(resolveAuthBaseUrl(undefined, "https://convex.example")).toBe("https://convex.example");
});
