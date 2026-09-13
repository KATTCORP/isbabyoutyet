import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { backfillUserProfileIsAdminDoc } from "./migrations";
import { modules, registerComponents } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

test("a profile defaults from the browser and persists an explicit locale", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  expect(await asAlice.query(api.profile.get, {})).toBeNull();
  expect(
    await asAlice.mutation(api.profile.ensure, {
      browserLocale: "sv-SE",
    }),
  ).toEqual({ locale: "sv", isAdmin: false });

  expect(
    await asAlice.mutation(api.profile.ensure, {
      browserLocale: "es-MX",
    }),
  ).toEqual({ locale: "sv", isAdmin: false });

  await asAlice.mutation(api.profile.updateLocale, { locale: "es" });
  expect(await asAlice.query(api.profile.get, {})).toEqual({ locale: "es", isAdmin: false });

  await asAlice.mutation(api.profile.updateLocale, { locale: "pt-BR" });
  expect(await asAlice.query(api.profile.get, {})).toEqual({
    locale: "pt-BR",
    isAdmin: false,
  });
});

test("unsupported browser locales fall back while language requests are stored", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  expect(
    await asAlice.mutation(api.profile.ensure, {
      browserLocale: "fr-FR",
    }),
  ).toEqual({ locale: "en-GB", isAdmin: false });

  const requestId = await asAlice.mutation(api.profile.requestLanguage, {
    requestedLocale: "French (fr-FR)",
  });
  const request = await t.run((ctx) => ctx.db.get(requestId));
  expect(request).toMatchObject({
    userId: "alice",
    requestedLocale: "French (fr-FR)",
  });
});

test("admin profiles preserve their flag across ensure and locale updates", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });
  await asAlice.mutation(api.profile.ensure, { browserLocale: "en-GB" });
  await t.run(async (ctx) => {
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", "https://convex.test|alice"))
      .unique();
    if (!profile) throw new Error("Profile missing");
    await ctx.db.patch(profile._id, { isAdmin: true });
  });

  expect(await asAlice.mutation(api.profile.ensure, { browserLocale: "sv" })).toEqual({
    locale: "en-GB",
    isAdmin: true,
  });
  expect(await asAlice.mutation(api.profile.updateLocale, { locale: "sv" })).toEqual({
    locale: "sv",
    isAdmin: true,
  });
});

test("locale updates create a missing profile", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  expect(await asAlice.mutation(api.profile.updateLocale, { locale: "es" })).toEqual({
    locale: "es",
    isAdmin: false,
  });
  expect(await asAlice.query(api.profile.get, {})).toEqual({
    locale: "es",
    isAdmin: false,
  });
});

test("language requests enforce their length bounds", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await expect(
    asAlice.mutation(api.profile.requestLanguage, { requestedLocale: "x" }),
  ).rejects.toThrow("Enter a language name or language code");
  await expect(
    asAlice.mutation(api.profile.requestLanguage, { requestedLocale: "x".repeat(101) }),
  ).rejects.toThrow("Enter a language name or language code");
});

test("profile mutations require authentication", async () => {
  const t = await setup();

  await expect(t.mutation(api.profile.updateLocale, { locale: "es" })).rejects.toThrow(
    "Not authenticated",
  );
});

test("backfillUserProfileIsAdmin fills missing isAdmin and leaves set values alone", async () => {
  const t = await setup();
  const ids = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("userProfiles", {
      userId: "already-admin",
      tokenIdentifier: "https://convex.test|already-admin",
      locale: "en-GB",
      isAdmin: true,
    });
    const nonAdmin = await ctx.db.insert("userProfiles", {
      userId: "already-false",
      tokenIdentifier: "https://convex.test|already-false",
      locale: "sv",
      isAdmin: false,
    });
    return { admin, nonAdmin };
  });

  await t.run(async (ctx) => {
    const admin = await ctx.db.get(ids.admin);
    const nonAdmin = await ctx.db.get(ids.nonAdmin);
    if (!admin || !nonAdmin) throw new Error("missing profiles");
    await backfillUserProfileIsAdminDoc(ctx, admin);
    await backfillUserProfileIsAdminDoc(ctx, nonAdmin);

    // Simulate a pre-migration document shape for the helper.
    const legacy = { ...nonAdmin } as {
      _id: typeof nonAdmin._id;
      _creationTime: number;
      userId: string;
      tokenIdentifier: string;
      locale: typeof nonAdmin.locale;
      isAdmin: boolean | undefined;
    };
    delete legacy.isAdmin;
    await backfillUserProfileIsAdminDoc(ctx, legacy as typeof nonAdmin);
  });

  await t.run(async (ctx) => {
    expect(await ctx.db.get(ids.admin)).toMatchObject({ isAdmin: true });
    expect(await ctx.db.get(ids.nonAdmin)).toMatchObject({ isAdmin: false });
  });
});
