import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { createAuth } from "./auth";
import { backfillUserProfileIsAdminDoc } from "./migrations";
import { modules, registerComponents } from "./test.setup";

/** Pre-migration row: `isAdmin` is `| undefined` so deleting it is a known field, not a widened bag. */
type LegacyUserProfile = {
  _creationTime: number;
  _id: Doc<"userProfiles">["_id"];
  isAdmin: boolean | undefined;
  locale: Doc<"userProfiles">["locale"];
  tokenIdentifier: string;
  userId: string;
};

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

const missingAccount = {
  email: "",
  emailVerified: false,
  name: "",
} as const;

function getProfile(prefs: { isAdmin: boolean; locale: string; timeZone: string }) {
  return {
    ...missingAccount,
    ...prefs,
  };
}

test("a missing authenticated profile defaults to British English", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  expect(await asAlice.query(api.profile.get, {})).toEqual(
    getProfile({
      isAdmin: false,
      locale: "en-GB",
      timeZone: "Europe/London",
    }),
  );

  await asAlice.mutation(api.profile.updateLocale, { locale: "es" });
  expect(await asAlice.query(api.profile.get, {})).toEqual(
    getProfile({
      isAdmin: false,
      locale: "es",
      timeZone: "Europe/London",
    }),
  );

  await asAlice.mutation(api.profile.updateLocale, { locale: "pt-BR" });
  expect(await asAlice.query(api.profile.get, {})).toEqual(
    getProfile({
      isAdmin: false,
      locale: "pt-BR",
      timeZone: "Europe/London",
    }),
  );
});

test("anonymous callers have no profile", async () => {
  const t = await setup();

  expect(await t.query(api.profile.get, {})).toBeNull();
});

test("profile reads include the Better Auth account and follow email changes", async () => {
  const t = await setup();
  const userId = await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: "ada@example.com",
        name: "Ada",
        password: "password123",
      },
    });
    return result.user.id;
  });
  const asAda = t.withIdentity({ subject: userId });

  expect(await asAda.query(api.profile.get, {})).toEqual({
    email: "ada@example.com",
    emailVerified: false,
    isAdmin: false,
    locale: "en-GB",
    name: "Ada",
    timeZone: "Europe/London",
  });

  await asAda.mutation(api.accountEmail.change, { newEmail: "ada.new@example.com" });
  expect(await asAda.query(api.profile.get, {})).toEqual({
    email: "ada.new@example.com",
    emailVerified: false,
    isAdmin: false,
    locale: "en-GB",
    name: "Ada",
    timeZone: "Europe/London",
  });
});

test("admin profiles preserve their flag across locale updates", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await t.run(async (ctx) => {
    await ctx.db.insert("userProfiles", {
      isAdmin: true,
      locale: "en-GB",
      tokenIdentifier: "https://convex.test|alice",
      userId: "alice",
    });
  });

  expect(await asAlice.query(api.profile.get, {})).toEqual(
    getProfile({
      isAdmin: true,
      locale: "en-GB",
      timeZone: "Europe/London",
    }),
  );
  expect(await asAlice.mutation(api.profile.updateLocale, { locale: "sv" })).toEqual({
    isAdmin: true,
    locale: "sv",
    timeZone: "Europe/London",
  });
});

test("locale updates create a missing profile", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  expect(await asAlice.mutation(api.profile.updateLocale, { locale: "es" })).toEqual({
    isAdmin: false,
    locale: "es",
    timeZone: "Europe/London",
  });
  expect(await asAlice.query(api.profile.get, {})).toEqual(
    getProfile({
      isAdmin: false,
      locale: "es",
      timeZone: "Europe/London",
    }),
  );
});

test("time zone updates are inherited by profile reads", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  expect(await asAlice.mutation(api.profile.updateTimeZone, { timeZone: "Asia/Tokyo" })).toEqual({
    isAdmin: false,
    locale: "en-GB",
    timeZone: "Asia/Tokyo",
  });
  expect(await asAlice.query(api.profile.get, {})).toEqual(
    getProfile({
      isAdmin: false,
      locale: "en-GB",
      timeZone: "Asia/Tokyo",
    }),
  );
  await expect(
    asAlice.mutation(api.profile.updateTimeZone, { timeZone: "Not/A_Time_Zone" }),
  ).rejects.toThrow("Choose a valid time zone");
});

test("time zone updates preserve an existing profile's locale", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.profile.updateLocale, { locale: "sv" });

  expect(
    await asAlice.mutation(api.profile.updateTimeZone, { timeZone: "America/New_York" }),
  ).toEqual({
    isAdmin: false,
    locale: "sv",
    timeZone: "America/New_York",
  });
});

test("profile mutations require authentication", async () => {
  const t = await setup();

  await expect(t.mutation(api.profile.updateLocale, { locale: "es" })).rejects.toThrow(
    "Not authenticated",
  );
  await expect(
    t.mutation(api.profile.updateTimeZone, { timeZone: "Europe/London" }),
  ).rejects.toThrow("Not authenticated");
});

test("backfillUserProfileIsAdmin fills missing isAdmin and leaves set values alone", async () => {
  const t = await setup();
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("userProfiles", {
      isAdmin: true,
      locale: "en-GB",
      tokenIdentifier: "https://convex.test|already-admin",
      userId: "already-admin",
    });
    const nonAdmin = await ctx.db.insert("userProfiles", {
      isAdmin: false,
      locale: "sv",
      tokenIdentifier: "https://convex.test|already-false",
      userId: "already-false",
    });
    return { admin, nonAdmin };
  });

  await t.run(async (ctx) => {
    const admin = await ctx.db.get(ids.admin);
    const nonAdmin = await ctx.db.get(ids.nonAdmin);
    if (!admin || !nonAdmin) {
      throw new Error("missing profiles");
    }
    await backfillUserProfileIsAdminDoc(ctx, admin);
    await backfillUserProfileIsAdminDoc(ctx, nonAdmin);

    // Simulate a pre-migration document shape for the helper.
    const legacy: LegacyUserProfile = { ...nonAdmin };
    delete legacy.isAdmin;
    // SAFETY: Mock constructor is installed in place of the browser global.
    await backfillUserProfileIsAdminDoc(ctx, legacy as typeof nonAdmin);
  });

  await t.run(async (ctx) => {
    expect(await ctx.db.get(ids.admin)).toMatchObject({ isAdmin: true });
    expect(await ctx.db.get(ids.nonAdmin)).toMatchObject({ isAdmin: false });
  });
});
