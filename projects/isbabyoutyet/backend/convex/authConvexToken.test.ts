import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { createAuth } from "./auth";
import { readConvexJwtFromSetCookie } from "./authConvexToken";
import { parseConvexTokenFromAuthResponse } from "../src/convexToken";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";

const COMPACT_JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;

test("readConvexJwtFromSetCookie finds the JWT regardless of cookie prefix or header joining", () => {
  const headers = new Headers();
  headers.append(
    "set-cookie",
    "__Secure-better-auth.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
  headers.append(
    "set-cookie",
    "__Secure-better-auth.convex_jwt=eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiIxIn0.c2ln; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
  expect(readConvexJwtFromSetCookie(headers)).toBe("eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiIxIn0.c2ln");
  expect(readConvexJwtFromSetCookie(new Headers())).toBeNull();
  expect(readConvexJwtFromSetCookie(undefined)).toBeNull();
});

test("parseConvexTokenFromAuthResponse only accepts a string token", () => {
  expect(parseConvexTokenFromAuthResponse({ convexToken: "a.b.c", user: {} })).toBe("a.b.c");
  expect(parseConvexTokenFromAuthResponse({ convexToken: 42 })).toBeNull();
  expect(parseConvexTokenFromAuthResponse({ user: {} })).toBeNull();
  expect(parseConvexTokenFromAuthResponse(null)).toBeNull();
});

test("email sign-up and sign-in responses carry the Convex JWT in the body", async () => {
  const t = convexTest(schema, modules);
  await registerComponents(t);

  const signUpToken = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: { email: "ada@example.com", name: "Ada", password: "password123" },
    });
    return parseConvexTokenFromAuthResponse(result);
  });
  expect(signUpToken).toMatch(COMPACT_JWT);

  const signInToken = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signInEmail({
      body: { email: "ada@example.com", password: "password123" },
    });
    return parseConvexTokenFromAuthResponse(result);
  });
  expect(signInToken).toMatch(COMPACT_JWT);
});
