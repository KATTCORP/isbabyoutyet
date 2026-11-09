import { expect, test } from "vitest";
import { detectDevicePlatform } from "@/lib/use-device-platform";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("Android is detected from the UA string when client hints are missing", () => {
  expect(detectDevicePlatform({ clientHintsPlatform: null, userAgent: ANDROID_UA })).toBe(
    "android",
  );
});

test("client hints win over the UA string", () => {
  expect(detectDevicePlatform({ clientHintsPlatform: "Android", userAgent: DESKTOP_UA })).toBe(
    "android",
  );
  expect(detectDevicePlatform({ clientHintsPlatform: "Windows", userAgent: ANDROID_UA })).toBe(
    "ios",
  );
});

test("iPhones and everything that is not Android look like iOS", () => {
  expect(detectDevicePlatform({ clientHintsPlatform: null, userAgent: IPHONE_UA })).toBe("ios");
  expect(detectDevicePlatform({ clientHintsPlatform: "", userAgent: DESKTOP_UA })).toBe("ios");
});
