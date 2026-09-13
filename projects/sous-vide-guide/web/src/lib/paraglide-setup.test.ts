// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { cookieName, getLocale } from "@/paraglide/runtime";
import { setLocale } from "@/lib/paraglide-setup";

function clearLocaleCookie() {
  document.cookie = `${cookieName}=; path=/; max-age=0`;
}

describe("paraglide cookie stamp guard", () => {
  it("does not persist a cookie when getLocale resolves the browser language", () => {
    clearLocaleCookie();
    expect(document.cookie.includes(`${cookieName}=`)).toBe(false);
    getLocale();
    expect(document.cookie.includes(`${cookieName}=`)).toBe(false);
    clearLocaleCookie();
  });

  it("persists a cookie for an explicit locale choice", async () => {
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
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
      clearLocaleCookie();
    }
  });
});
