import { expect, test } from "vitest";
import { translate, type TranslationFunction } from "@/lib/i18n";
import { passkeyDisplayName } from "./passkey-label";

const t: TranslationFunction = (key, ...args) => translate("en-GB", key, ...args);

test("a stored device name is shown as saved", () => {
  expect(passkeyDisplayName({ aaguid: null, name: "Kitchen laptop" }, t)).toBe("Kitchen laptop");
});

test("an unnamed device falls back to this device", () => {
  expect(passkeyDisplayName({ aaguid: null, name: "This device" }, t)).toBe("This device");
  expect(passkeyDisplayName({ aaguid: null, name: null }, t)).toBe("This device");
});
