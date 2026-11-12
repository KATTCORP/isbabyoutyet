import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { createAuth } from "./auth";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";

/** The Convex backend fetches every JWKS from one address (RFC 5737 documentation IP). */
const CONVEX_BACKEND_IP: HeadersInit = { "x-forwarded-for": "203.0.113.7" };

async function rateLimitKeys(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const authContext = await createAuth(ctx).$context;
    const rows = await authContext.adapter.findMany<{ key: string }>({ model: "rateLimit" });
    return rows.map((row) => row.key);
  });
}

test("Convex's JWKS and OpenID discovery fetches are not rate-limited (PERSONAL-ISBABYOUTYET-C/D/E)", async () => {
  const t = convexTest(schema, modules);
  registerComponents(t);

  const responses = await Promise.all([
    t.fetch("/api/auth/convex/jwks", { headers: CONVEX_BACKEND_IP }),
    t.fetch("/api/auth/convex/jwks", { headers: CONVEX_BACKEND_IP }),
    t.fetch("/api/auth/convex/.well-known/openid-configuration", { headers: CONVEX_BACKEND_IP }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  expect(await rateLimitKeys(t)).toEqual([]);
});

test("other auth endpoints are still rate-limited", async () => {
  const t = convexTest(schema, modules);
  registerComponents(t);

  await t.fetch("/api/auth/get-session", { headers: CONVEX_BACKEND_IP });

  expect(await rateLimitKeys(t)).toEqual([expect.stringContaining("/get-session")]);
});
