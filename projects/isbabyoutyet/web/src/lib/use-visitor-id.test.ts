import { expect, test } from "vitest";
import { rememberInBrowser } from "@/lib/remembered";
import { peekVisitorId, rememberedVisitorId, visitorIdOfRequest } from "@/lib/use-visitor-id";
import { clearBrowserCookies } from "@/test/browserCookies";

test("a browser that has not posted has no visitor id", () => {
  clearBrowserCookies();
  localStorage.removeItem("encouragement-visitor-id");

  expect(peekVisitorId()).toBeNull();
});

test("the visitor id is the one the browser was told to remember", () => {
  clearBrowserCookies();
  rememberInBrowser([rememberedVisitorId("visitor-from-cookie")]);

  expect(peekVisitorId()).toBe("visitor-from-cookie");
  clearBrowserCookies();
});

test("an id from before it was a cookie still counts, until a cookie replaces it", () => {
  clearBrowserCookies();
  localStorage.setItem("encouragement-visitor-id", "visitor-from-before");

  expect(peekVisitorId()).toBe("visitor-from-before");

  rememberInBrowser([rememberedVisitorId("visitor-from-cookie")]);

  expect(peekVisitorId()).toBe("visitor-from-cookie");
  localStorage.removeItem("encouragement-visitor-id");
  clearBrowserCookies();
});

test("a request carries the visitor id in its cookies", () => {
  const withId = new Request("https://isbabyoutyet.test/", {
    headers: { cookie: "theme=dark; visitor-id=visitor-from-cookie" },
  });

  expect(visitorIdOfRequest(withId)).toBe("visitor-from-cookie");
  expect(visitorIdOfRequest(new Request("https://isbabyoutyet.test/"))).toBeNull();
});
