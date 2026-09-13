import { expect, test } from "vitest";
import { lazyGetter } from "../src/utils";

test("lazyGetter creates its value once on the first property read", () => {
  let calls = 0;
  const value = lazyGetter(() => {
    calls += 1;
    return { count: 3, name: "Ada" };
  });

  expect(calls).toBe(0);
  expect(value.name).toBe("Ada");
  expect(value.count).toBe(3);
  expect(calls).toBe(1);
});

test("lazyGetter reads prototype getters and missing keys", () => {
  const proto = {
    get label() {
      return "via-getter";
    },
  };
  const value = lazyGetter(() => Object.create(proto, { own: { value: 1 } }));
  expect(value.own).toBe(1);
  expect(value.label).toBe("via-getter");
  expect(value.missing).toBeUndefined();
});
