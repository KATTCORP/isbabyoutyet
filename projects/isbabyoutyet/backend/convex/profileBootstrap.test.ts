import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createAuth } from "./auth";
import { localeFromAcceptLanguage } from "./profileBootstrap";
import { createEncouragementArgs, modules, registerComponents } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

test("localeFromAcceptLanguage picks the first supported tag", () => {
  expect(localeFromAcceptLanguage("sv-SE,en;q=0.9")).toBe("sv");
  expect(localeFromAcceptLanguage("fr-FR,en;q=0.9")).toBe("en-GB");
});

test("sign-up creates a profile from Accept-Language", async () => {
  const t = await setup();
  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "locale@example.com",
        name: "Locale User",
        password: "password123",
      },
      headers: {
        "accept-language": "sv-SE,en;q=0.9",
        "x-time-zone": "Asia/Tokyo",
      },
    });
    return result.user.id;
  });

  const asUser = t.withIdentity({ subject: userId });
  expect(await asUser.query(api.profile.get, {})).toEqual({
    email: "locale@example.com",
    emailVerified: false,
    isAdmin: false,
    locale: "sv",
    name: "Locale User",
    timeZone: "Asia/Tokyo",
  });
});

test("sign-in ensures a profile exists for legacy users", async () => {
  const t = await setup();
  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "legacy@example.com",
        name: "Legacy",
        password: "password123",
      },
    });
    return result.user.id;
  });

  await t.run(async (ctx) => {
    const tokenIdentifier = `https://convex.test|${userId}`;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!profile) {
      throw new Error("expected sign-up profile");
    }
    await ctx.db.delete(profile._id);
  });

  await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    await auth.api.signInEmail({
      body: {
        email: "legacy@example.com",
        password: "password123",
      },
      headers: {
        "accept-language": "es-MX",
        "x-time-zone": "America/New_York",
      },
    });
  });

  const asUser = t.withIdentity({ subject: userId });
  expect(await asUser.query(api.profile.get, {})).toEqual({
    email: "legacy@example.com",
    emailVerified: false,
    isAdmin: false,
    locale: "es",
    name: "Legacy",
    timeZone: "America/New_York",
  });
});

test("sign-in fills a missing time zone without replacing the saved language", async () => {
  const t = await setup();
  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "missing-time-zone@example.com",
        name: "Missing Time Zone",
        password: "password123",
      },
      headers: {
        "accept-language": "sv-SE",
      },
    });
    return result.user.id;
  });

  await t.run(async (ctx) => {
    const tokenIdentifier = `https://convex.test|${userId}`;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!profile) {
      throw new Error("expected sign-up profile");
    }
    await ctx.db.replace("userProfiles", profile._id, {
      isAdmin: profile.isAdmin,
      locale: profile.locale,
      tokenIdentifier: profile.tokenIdentifier,
      userId: profile.userId,
    });
  });

  await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    await auth.api.signInEmail({
      body: {
        email: "missing-time-zone@example.com",
        password: "password123",
      },
      headers: {
        "accept-language": "es-MX",
        "x-time-zone": "Asia/Tokyo",
      },
    });
  });

  expect(await t.withIdentity({ subject: userId }).query(api.profile.get, {})).toEqual({
    email: "missing-time-zone@example.com",
    emailVerified: false,
    isAdmin: false,
    locale: "sv",
    name: "Missing Time Zone",
    timeZone: "Asia/Tokyo",
  });
});

test("sign-in does not replace saved browser preferences", async () => {
  const t = await setup();
  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "saved-preferences@example.com",
        name: "Saved Preferences",
        password: "password123",
      },
      headers: {
        "accept-language": "sv-SE",
        "x-time-zone": "Asia/Tokyo",
      },
    });
    return result.user.id;
  });

  await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    await auth.api.signInEmail({
      body: {
        email: "saved-preferences@example.com",
        password: "password123",
      },
      headers: {
        "accept-language": "es-MX",
        "x-time-zone": "America/New_York",
      },
    });
  });

  expect(await t.withIdentity({ subject: userId }).query(api.profile.get, {})).toEqual({
    email: "saved-preferences@example.com",
    emailVerified: false,
    isAdmin: false,
    locale: "sv",
    name: "Saved Preferences",
    timeZone: "Asia/Tokyo",
  });
});

async function insertBaby(t: Awaited<ReturnType<typeof setup>>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("baby", {
      birthJourney: "labor",
      dueDate: "2026-09-01",
      dueDateDisplayMode: "exact",
      lastActivityAt: 1,
      name: "Baby Smith",
      ownerTokenIdentifier: "https://convex.test|owner",
      publicDueDateText: null,
      publicId: "baby-smith-claim",
      subscriptionCount: 0,
      userId: "owner",
    });
  });
}

test("sign-up claims guest encouragements for the visitor id header", async () => {
  const t = await setup();
  const babyId: Id<"baby"> = await insertBaby(t);
  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Guest Name",
      babyId,
      message: "Posted before I had an account",
      visitorId: "visitor-to-claim",
    }),
  );

  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "claimer@example.com",
        name: "Account Name",
        password: "password123",
      },
      headers: {
        "x-visitor-id": "visitor-to-claim",
      },
    });
    return result.user.id;
  });

  const stored = await t.run(async (ctx) => {
    return await ctx.db
      .query("encouragements")
      .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
      .collect();
  });
  expect(stored).toMatchObject([
    {
      author: { type: "user", userId, visitorId: "visitor-to-claim" },
      authorName: "Guest Name",
      visitorId: "visitor-to-claim",
    },
  ]);

  const listed = await t.withIdentity({ subject: userId }).query(api.encouragements.listByBaby, {
    babyId,
    paginationOpts: { cursor: null, numItems: 10 },
    visitorId: "another-device",
  });
  expect(listed.page).toMatchObject([{ authorName: "Guest Name", isMine: true }]);
});

test("sign-in claims guest encouragements for the visitor id header", async () => {
  const t = await setup();
  const babyId: Id<"baby"> = await insertBaby(t);
  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "returner@example.com",
        name: "Returner",
        password: "password123",
      },
    });
    return result.user.id;
  });

  await t.mutation(
    api.encouragements.create,
    createEncouragementArgs({
      authorName: "Still Guest",
      babyId,
      message: "Posted while logged out",
      visitorId: "returning-visitor",
    }),
  );

  await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    await auth.api.signInEmail({
      body: {
        email: "returner@example.com",
        password: "password123",
      },
      headers: {
        "x-visitor-id": "returning-visitor",
      },
    });
  });

  const stored = await t.run(async (ctx) => {
    return await ctx.db
      .query("encouragements")
      .withIndex("by_babyId", (q) => q.eq("babyId", babyId))
      .collect();
  });
  expect(stored).toMatchObject([
    {
      author: { type: "user", userId, visitorId: "returning-visitor" },
      authorName: "Still Guest",
      visitorId: "returning-visitor",
    },
  ]);
});
