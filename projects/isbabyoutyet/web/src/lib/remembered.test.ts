import { expect, test, vi } from "vitest";
import {
  readRemembered,
  recallInBrowser,
  rememberedCookie,
  rememberInBrowser,
  subscribeToRemembered,
} from "@/lib/remembered";
import { clearBrowserCookies } from "@/test/browserCookies";

test("a remembered value is a year-long cookie for the whole site", () => {
  expect(rememberedCookie({ name: "author-name", value: "Åsa & Bo" }, { secure: true })).toBe(
    "author-name=%C3%85sa%20%26%20Bo; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
  );
  expect(rememberedCookie({ name: "visitor-id", value: "abc" }, { secure: false })).toBe(
    "visitor-id=abc; Path=/; Max-Age=31536000; SameSite=Lax",
  );
});

test("a value is read back out of a Cookie header", () => {
  const cookies = "theme=dark; author-name=%C3%85sa%20%26%20Bo; visitor-id=abc";

  expect(readRemembered(cookies, "author-name")).toBe("Åsa & Bo");
  expect(readRemembered(cookies, "visitor-id")).toBe("abc");
  expect(readRemembered(cookies, "name")).toBeNull();
  expect(readRemembered(null, "visitor-id")).toBeNull();
});

test("an empty or mangled cookie counts as nothing remembered", () => {
  expect(readRemembered("visitor-id=", "visitor-id")).toBeNull();
  expect(readRemembered("visitor-id=%E0%A4%A", "visitor-id")).toBeNull();
});

test("the browser keeps what it is told to remember, and says so", () => {
  clearBrowserCookies();
  const notify = vi.fn();
  const unsubscribe = subscribeToRemembered(notify);

  rememberInBrowser([
    { name: "visitor-id", value: "abc" },
    { name: "author-name", value: "Auntie Jo" },
  ]);
  unsubscribe();
  rememberInBrowser([{ name: "author-name", value: "Uncle Bo" }]);

  expect(recallInBrowser("visitor-id")).toBe("abc");
  expect(recallInBrowser("author-name")).toBe("Uncle Bo");
  expect(notify).toHaveBeenCalledOnce();
  clearBrowserCookies();
});
