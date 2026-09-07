import { createRemoteJWKSet, jwtVerify } from "jose";
import { expect, test } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
import { parseConvexTokenFromAuthResponse } from "@workspace/convex/src/convexToken";
import { isPlainObject, isString } from "@workspace/runtime/guards";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signInTestUser, signUpTestUser } from "@/test/convexTestSeed";

const ADA = { email: "ada@example.com", name: "Ada", password: "password123" };
const AUTH_BASE = `${import.meta.env.VITE_SITE_URL}/api/auth`;

test("signing in through the bridge leaves the browser with a Better Auth session", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);

  const anonymous = await fetch(`${AUTH_BASE}/get-session`);
  expect(await anonymous.json()).toBeNull();

  const userId = await signInTestUser(harness, ADA);

  const cookies = await harness.cookieJar.getCookies(AUTH_BASE);
  expect(cookies.map((cookie) => cookie.key)).toContain("better-auth.session_token");
  const signedIn = await fetch(`${AUTH_BASE}/get-session`);
  expect(await signedIn.json()).toEqual(
    expect.objectContaining({ user: expect.objectContaining({ email: ADA.email, id: userId }) }),
  );
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: ADA.email }),
  );
});

test("the Convex JWT minted at sign-in verifies against the backend's own JWKS", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, ADA);

  const signIn = await fetch(`${AUTH_BASE}/sign-in/email`, {
    body: JSON.stringify({ email: ADA.email, password: ADA.password }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const token = parseConvexTokenFromAuthResponse(await signIn.json());
  expect(token).toBeTypeOf("string");

  const discovery: unknown = await (
    await fetch(`${AUTH_BASE}/convex/.well-known/openid-configuration`)
  ).json();
  if (!isPlainObject(discovery) || !isString(discovery.issuer) || !isString(discovery.jwks_uri)) {
    throw new Error("openid-configuration missing issuer / jwks_uri");
  }

  const verified = await jwtVerify(token ?? "", createRemoteJWKSet(new URL(discovery.jwks_uri)), {
    audience: "convex",
    issuer: discovery.issuer,
  });
  expect(verified.payload.sub).toBe(userId);
  expect(verified.payload.exp).toBeGreaterThan(Date.now() / 1000);
});
