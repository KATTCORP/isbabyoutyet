import { expect, test } from "vitest";
import {
  babyLoginHomeLink,
  loginSuccessTarget,
  overlayLoginSuccessTarget,
} from "./baby-login-redirect";

test.each([
  { publicId: "baby-waiting", redirect: "/baby/baby-waiting" },
  { publicId: "juniper-hale", redirect: "/baby/juniper-hale" },
])("home link returns to the baby page $redirect", (testCase) => {
  expect(babyLoginHomeLink(testCase.redirect)).toEqual({
    params: { publicId: testCase.publicId },
    to: "/baby/$publicId",
  });
});

test.each(["/dashboard", "/dashboard/settings", "/baby/baby-waiting/settings", "/auth/login"])(
  "allows the same-origin path %s after login",
  (redirect) => {
    expect(loginSuccessTarget(redirect)).toEqual({ href: redirect });
    expect(overlayLoginSuccessTarget(redirect)).toEqual({ href: redirect });
  },
);

test.each([
  undefined,
  "",
  "//evil.example",
  "https://evil.example/baby/baby-waiting",
  String.raw`/baby/baby\waiting`,
  "baby-waiting",
])("rejects %s as a login redirect", (redirect) => {
  expect(loginSuccessTarget(redirect)).toEqual({ href: "/dashboard" });
  expect(overlayLoginSuccessTarget(redirect)).toBeNull();
  expect(babyLoginHomeLink(redirect)).toEqual({ to: "/" });
});
