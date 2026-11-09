import { defaultParseSearch } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { previewBabyFromSearch, previewSearchSchema } from "@/lib/preview-baby";

function parse(query: string) {
  return previewSearchSchema.safeParse(defaultParseSearch(query));
}

test("a preview URL's query parses into the same baby the page shows", () => {
  const parsed = parse("?name=Alba&theme=mocha-mousse&babyBorn=2026-08-11T03%3A00%3A00.000Z");
  if (!parsed.success) {
    throw parsed.error;
  }
  const baby = previewBabyFromSearch(parsed.data);
  expect(baby).toMatchObject({
    babyBorn: "2026-08-11T03:00:00.000Z",
    dueDateDisplayMode: "exact",
    name: "Alba",
    photoId: null,
    theme: "mocha-mousse",
  });
  expect(baby.milestoneVisibility).toEqual(
    previewBabyFromSearch({ name: "x" }).milestoneVisibility,
  );
});

test("a preview without a due date is due in a week", () => {
  const baby = previewBabyFromSearch({ name: "Baby" });
  const days = (Date.parse(baby.dueDate ?? "") - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.1);
});

test("a preview URL with a malformed param is rejected", () => {
  expect(parse("?name=Alba&birthJourney=teleport").success).toBe(false);
});
