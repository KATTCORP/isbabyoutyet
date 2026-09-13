import { expect, test, vi } from "vitest";
import { cookieName, getLocale } from "@/paraglide/runtime";
import { setLocale } from "./paraglide-setup";

function clearLocaleCookie() {
  document.cookie = `${cookieName}=; path=/; max-age=0`;
}

test("detecting the browser locale does not lock Accept-Language behind a cookie", () => {
  clearLocaleCookie();
  expect(document.cookie.includes(`${cookieName}=`)).toBe(false);

  getLocale();

  expect(document.cookie.includes(`${cookieName}=`)).toBe(false);
  clearLocaleCookie();
});

test("explicit locale selection still persists the cookie", async () => {
  clearLocaleCookie();
  const reload = vi.fn<() => void>();
  const originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });

  try {
    await setLocale("sv");
    expect(document.cookie).toContain(`${cookieName}=sv`);
    expect(reload).toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    clearLocaleCookie();
  }
});
