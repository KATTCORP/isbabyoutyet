import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, registerComponents, createBabyArgs, postUpdateArgs } from "./test.setup";
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
    activeCoachmarkStepId: null,
    allDone: false,
    checklistDismissed: false,
    completedSteps: [],
    effectiveSteps: [],
    hasBaby: false,
    hasUpdate: false,
    minimized: false,
    restartHintVisible: false,
    tourBaby: null,
    welcomeDismissed: false,
  });
});

test("dismissWelcome and completeStep persist for the owner", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.onboarding.dismissWelcome, {});
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    completedSteps: [],
    welcomeDismissed: true,
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

  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Tour Baby",
    }),
  );

  let progress = await asAlice.query(api.onboarding.getMine, {});
  expect(progress.hasBaby).toBe(true);
  expect(progress.effectiveSteps).toContain("add_baby");
  expect(progress.hasUpdate).toBe(false);

  await asAlice.mutation(
    api.updates.post,
    postUpdateArgs({
      babyId: created.babyId,
      message: "Hello from the tour",
    }),
  );

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
    completedSteps: ["share_link"],
    welcomeDismissed: true,
  });

  await asAlice.mutation(api.onboarding.restart, {});
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    activeCoachmarkStepId: null,
    checklistDismissed: false,
    completedSteps: ["share_link"],
    minimized: false,
    restartHintVisible: false,
    welcomeDismissed: false,
  });
});

// Presentation chrome on the onboarding progress doc (not URL state).
test("coachmark and restart-hint presentation persist on userOnboarding", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(api.onboarding.setActiveCoachmarkStepId, { stepId: "share_link" });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    activeCoachmarkStepId: "share_link",
  });

  await asAlice.mutation(api.onboarding.setRestartHintVisible, { visible: true });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    restartHintVisible: true,
  });

  await asAlice.mutation(api.onboarding.completeStep, { stepId: "share_link" });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    activeCoachmarkStepId: null,
    completedSteps: ["share_link"],
  });

  await asAlice.mutation(api.onboarding.setActiveCoachmarkStepId, { stepId: "post_update" });
  await asAlice.mutation(api.onboarding.dismissChecklist, {});
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    activeCoachmarkStepId: null,
    checklistDismissed: true,
  });
});

test("getMine points the tour at the first created baby", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "First",
    }),
  );
  await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-10-01",
      name: "Second",
    }),
  );

  const progress = await asAlice.query(api.onboarding.getMine, {});
  expect(progress.tourBaby?.name).toBe("First");
  expect(progress.tourBaby?.publicId).toBeTruthy();
});

test("restart with a baby skips the welcome carousel", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Ada",
    }),
  );
  await asAlice.mutation(api.onboarding.dismissChecklist, {});
  await asAlice.mutation(api.onboarding.restart, {});

  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    checklistDismissed: false,
    hasBaby: true,
    minimized: false,
    welcomeDismissed: true,
  });
});

test("completeStep rejects unknown step ids", async () => {
  const t = await setup();
  const asAlice = t.withIdentity({ subject: "alice" });

  await expect(
    // @ts-expect-error — "not_a_real_step" is not an onboarding step id
    asAlice.mutation(api.onboarding.completeStep, { stepId: "not_a_real_step" }),
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
        name: opts.name,
        password: "password123",
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
  expect(first).toMatchObject({ alreadyRan: false, isDone: true });
  expect(first.processed).toBeGreaterThanOrEqual(2);

  const asAlice = t.withIdentity({ subject: aliceId });
  const asBob = t.withIdentity({ subject: bobId });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    allDone: true,
    checklistDismissed: true,
    effectiveSteps: [...ONBOARDING_STEP_IDS],
    welcomeDismissed: true,
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
  expect(second).toMatchObject({ alreadyRan: true, isDone: true, processed: 0 });

  const asCarol = t.withIdentity({ subject: carolId });
  expect(await asCarol.query(api.onboarding.getMine, {})).toMatchObject({
    allDone: false,
    checklistDismissed: false,
    completedSteps: [],
    welcomeDismissed: false,
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
    allDone: false,
    checklistDismissed: false,
    completedSteps: [],
    welcomeDismissed: false,
  });

  const asAlice = t.withIdentity({ subject: aliceId });
  expect(await asAlice.query(api.onboarding.getMine, {})).toMatchObject({
    checklistDismissed: true,
    welcomeDismissed: true,
  });
});
