import { expect, test } from "vitest";
import { replaceBabyPublicId } from "./baby-public-id-href";

test.each([
  {
    expected: "/baby/nova-rae",
    href: "/baby/baby-smith",
  },
  {
    expected: "/baby/nova-rae/settings",
    href: "/baby/baby-smith/settings",
  },
  {
    expected: "/baby/nova-rae/updates/abc/photo",
    href: "/baby/baby-smith/updates/abc/photo",
  },
  {
    expected: "/baby/nova-rae/settings?beta=true",
    href: "/baby/baby-smith/settings?beta=true",
  },
  {
    expected: "/baby/nova-rae#feed",
    href: "/baby/baby-smith#feed",
  },
])("rewrites only the public id in $href", (testCase) => {
  expect(
    replaceBabyPublicId({
      fromPublicId: "baby-smith",
      href: testCase.href,
      toPublicId: "nova-rae",
    }),
  ).toEqual({
    href: testCase.expected,
    replace: true,
  });
});

test("does not treat a longer slug as the same baby path", () => {
  expect(() =>
    replaceBabyPublicId({
      fromPublicId: "baby",
      href: "/baby/baby-smith/settings",
      toPublicId: "nova-rae",
    }),
  ).toThrow(/not under \/baby\/baby/);
});
