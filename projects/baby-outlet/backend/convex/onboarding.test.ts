import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents } from "./test.setup";
import { ONBOARDING_STEP_IDS } from "../src/onboardingSteps";
import { createAuth } from "./auth";
import { SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL } from "./onboarding";
import { DEMO_EMPTY_USER } from "../src/seedCredentials";

async function setup() {
  const t = convexTest(schema, modules);
  await registerComponents(t);
  return t;
}

test("getMine returns empty defaults for anonymous callers", async () => {
  const t = await setup();
  expect(await t.query(api.onboarding.getMine, {})).toMatchObject({
    welcomeDismissed: false,
    checklistDismissed: false,
    minimized: false,
    completedSteps: [],
    hasBaby: false,
    hasUpdate: false,
    effectiveSteps: [],
    allDone: false,
    tourBaby: null,
  });
});

test("dismissWelcome and completeStep persist for the owner", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.onboarding.dismissWelcome, {});
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    welcomeDismissed: true,
    completedSteps: [],
  });

  await asAlice.mutation(api.onboarding.completeStep, { stepId: "share_link" });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    completedSteps: ["share_link"],
    effectiveSteps: ["share_link"],
  });

  // Idempotent
  await asAlice.mutation(api.onboarding.completeStep, { stepId: "share_link" });
  expect((await asAlice.query(api.onboarding.getMine, {})).completedSteps).toEqual(["share_link"]);
});

test("creating a baby auto-completes add_baby; posting auto-completes post_update", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Tour Baby",
    dueDate: "2026-09-01",
  });

  let progress = await asAlice.query(api.onboarding.getMine, {});
  expect(progress.hasBaby).toBe(true);
  expect(progress.effectiveSteps).toContain("add_baby");
  expect(progress.hasUpdate).toBe(false);

  await asAlice.mutation(api.updates.post, {
    babyId: created.babyId,
    message: "Hello from the tour",
  });

  progress = await asAlice.query(api.onboarding.getMine, {});
  expect(progress.hasUpdate).toBe(true);
  expect(progress.effectiveSteps).toEqual(expect.arrayContaining(["add_baby", "post_update"]));
});

test("dismissChecklist hides the tour; restart brings it back without wiping steps", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.onboarding.completeStep, { stepId: "share_link" });
  await asAlice.mutation(api.onboarding.dismissChecklist, {});

  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    checklistDismissed: true,
    welcomeDismissed: true,
    completedSteps: ["share_link"],
  });

  await asAlice.mutation(api.onboarding.restart, {});
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    checklistDismissed: false,
    welcomeDismissed: false,
    minimized: false,
    completedSteps: ["share_link"],
  });
});

test("getMine points the tour at the first created baby", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.baby.create, {
    name: "First",
    dueDate: "2026-09-01",
  });
  await asAlice.mutation(api.baby.create, {
    name: "Second",
    dueDate: "2026-10-01",
  });

  const progress = await asAlice.query(api.onboarding.getMine, {});
  expect(progress.tourBaby?.name).toBe("First");
  expect(progress.tourBaby?.publicId).toBeTruthy();
});

test("restart with a baby skips the welcome carousel", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.baby.create, {
    name: "Ada",
    dueDate: "2026-09-01",
  });
  await asAlice.mutation(api.onboarding.dismissChecklist, {});
  await asAlice.mutation(api.onboarding.restart, {});

  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    checklistDismissed: false,
    welcomeDismissed: true,
    minimized: false,
    hasBaby: true,
  });
});

test("disabling encouragements on the first baby auto-completes that tip", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  const created = await asAlice.mutation(api.baby.create, {
    name: "Quiet",
    dueDate: "2026-09-01",
  });
  await asAlice.mutation(api.baby.update, {
    babyId: created.babyId,
    encouragementsDisabled: true,
  });

  const progress = await asAlice.query(api.onboarding.getMine, {});
  expect(progress.effectiveSteps).toContain("learn_encouragements");
});

test("completeStep rejects unknown step ids", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await expect(
    asAlice.mutation(api.onboarding.completeStep, { stepId: "not_a_real_step" as never }),
  ).rejects.toThrow(/Validator error/);
});

test("allDone when every step is effective", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  for (const stepId of ONBOARDING_STEP_IDS) {
    await asAlice.mutation(api.onboarding.completeStep, { stepId });
  }

  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    allDone: true,
    effectiveSteps: [...ONBOARDING_STEP_IDS],
  });
});

test("setMinimized toggles the checklist chip state", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.onboarding.setMinimized, { minimized: true });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({ minimized: true });

  await asAlice.mutation(api.onboarding.setMinimized, { minimized: false });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({ minimized: false });
});

test("mutations require authentication", async () => {
  const t = await setup();
  await expect(t.mutation(api.onboarding.dismissWelcome, {})).rejects.toThrow(/Not authenticated/);
  await expect(t.mutation(api.onboarding.dismissChecklist, {})).rejects.toThrow(
    /Not authenticated/,
  );
  await expect(t.mutation(api.onboarding.restart, {})).rejects.toThrow(/Not authenticated/);
  await expect(t.mutation(api.onboarding.setMinimized, { minimized: true })).rejects.toThrow(
    /Not authenticated/,
  );
  await expect(t.mutation(api.onboarding.completeStep, { stepId: "share_link" })).rejects.toThrow(
    /Not authenticated/,
  );
});

async function signUpUser(
  t: Awaited<ReturnType<typeof setup>>,
  opts: { email: string; name: string },
) {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: opts.email,
        password: "password123",
        name: opts.name,
      },
    });
    return result.user.id;
  });
}

test("skipTourForExistingUsers grandfathers registered users and leaves later signups alone", async () => {
  const t = await setup();

  const aliceId = await signUpUser(t, { email: "alice@example.com", name: "Alice" });
  const bobId = await signUpUser(t, { email: "bob@example.com", name: "Bob" });

  const first = await t.mutation(internal.migrations.skipTourForExistingUsers, { cursor: null });
  expect(first).toMatchObject({ isDone: true, alreadyRan: false });
  expect(first.processed).toBeGreaterThanOrEqual(2);

  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    welcomeDismissed: true,
    checklistDismissed: true,
    allDone: true,
    effectiveSteps: [...ONBOARDING_STEP_IDS],
  });
  expect(await asBob.query(api.onboarding.getMine, {})).toMatchObject({
    checklistDismissed: true,
  });

  const sentinel = await t.run(async (ctx) => {
    return await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", SKIP_TOUR_FOR_EXISTING_USERS_SENTINEL))
      .unique();
  });
  expect(sentinel).toBeTruthy();

  const carolId = await signUpUser(t, { email: "carol@example.com", name: "Carol" });
  const second = await t.mutation(internal.migrations.skipTourForExistingUsers, { cursor: null });
  expect(second).toMatchObject({ isDone: true, alreadyRan: true, processed: 0 });

  const asCarol = t.withIdentity({ subject: carolId });
  expect(await asCarol.query(api.onboarding.getMine, {})).toMatchObject({
    welcomeDismissed: false,
    checklistDismissed: false,
    allDone: false,
    completedSteps: [],
  });
});

test("skipTourForExistingUsers leaves the empty demo login on the first-run tour", async () => {
  const t = await setup();
  const emptyId = await signUpUser(t, {
    email: DEMO_EMPTY_USER.email,
    name: DEMO_EMPTY_USER.name,
  });
  const aliceId = await signUpUser(t, { email: "alice@example.com", name: "Alice" });

  await t.mutation(internal.migrations.skipTourForExistingUsers, { cursor: null });

  const asEmpty = t.withIdentity({ subject: emptyId });
  expect(await asEmpty.query(api.onboarding.getMine, {})).toMatchObject({
    welcomeDismissed: false,
    checklistDismissed: false,
    allDone: false,
    completedSteps: [],
  });

  const asAlice = t.withIdentity({ subject: aliceId });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    welcomeDismissed: true,
    checklistDismissed: true,
  });
});
