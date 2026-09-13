import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { createAuth } from "@isbabyoutyet/backend/convex/auth";
import type { FunctionArgs } from "convex/server";
import type { ConvexTestHarness } from "@/test/convexTestHarness";

/** Creates a baby owned by the harness identity (must already be set). */
export async function seedOwnedBaby(
  harness: ConvexTestHarness,
  opts: {
    dueDate: string | null;
    name: string;
  },
) {
  const created = await harness.client.mutation(api.baby.create, {
    birthJourney: "labor",
    dueDate: opts.dueDate,
    dueDateDisplayMode: opts.dueDate ? "exact" : "message",
    name: opts.name,
    publicDueDateText: null,
    theme: null,
  });
  return {
    // SAFETY: Seeded convex-test document id.
    babyId: created.babyId as Id<"baby">,
    publicId: created.publicId,
  };
}

/** Signs up a Better Auth user through the in-memory Convex backend. */
export async function signUpTestUser(
  harness: ConvexTestHarness,
  opts: {
    email: string;
    name: string;
    password: string;
  },
) {
  return await harness.t.run(async (ctx) => {
    const auth = createAuth(ctx);
    const result = await auth.api.signUpEmail({
      body: {
        email: opts.email,
        name: opts.name,
        password: opts.password,
      },
    });
    return result.user.id;
  });
}

export async function storeTestBlob(harness: ConvexTestHarness) {
  return await harness.t.run(async (ctx) => {
    const buffer = new ArrayBuffer(8);
    new Uint8Array(buffer).set([137, 80, 78, 71, 13, 10, 26, 10]);
    return await ctx.storage.store(new Blob([buffer], { type: "image/png" }));
  });
}

/** Creates a baby with a page photo stored in the in-memory Convex backend. */
export async function seedBabyWithPhoto(
  harness: ConvexTestHarness,
  opts: {
    dueDate: string | null;
    name: string;
  },
) {
  const baby = await seedOwnedBaby(harness, opts);
  const photoId = await storeTestBlob(harness);
  await harness.client.mutation(api.baby.updatePhoto, {
    babyId: baby.babyId,
    photoId,
  });
  return {
    ...baby,
    photoId,
  };
}

/** Posts a timeline update with a photo and returns the update id. */
export async function seedTimelineUpdateWithPhoto(
  harness: ConvexTestHarness,
  opts: {
    babyId: Id<"baby">;
    message: string;
  },
) {
  const photoId = await storeTestBlob(harness);
  const updateId = await harness.client.mutation(api.updates.post, {
    babyId: opts.babyId,
    message: opts.message,
    milestone: null,
    occurredAt: null,
    photoId,
  });
  return { photoId, updateId };
}

/** Registers push subscriptions for a baby (manager-only count query). */
export async function seedPushSubscriptions(
  harness: ConvexTestHarness,
  opts: {
    babyId: Id<"baby">;
    count: number;
  },
) {
  for (let index = 0; index < opts.count; index += 1) {
    await harness.client.mutation(api.pushSubscriptions.subscribe, {
      auth: "private-auth-secret",
      babyId: opts.babyId,
      endpoint: `https://push.example/subscription-${index}`,
      p256dh: "public-key",
      userAgent: "vitest",
    });
  }
}

/** Posts a labor_started milestone so getScheduledNotifications returns a pending row. */
export async function seedPendingLaborNotification(
  harness: ConvexTestHarness,
  opts: {
    babyId: Id<"baby">;
  },
) {
  await harness.client.mutation(api.updates.post, {
    babyId: opts.babyId,
    message: null,
    milestone: "labor_started",
    occurredAt: null,
    photoId: null,
  });
}

/** Sparse test patch for `baby.update`; unspecified `patch` keys keep the stored values. */
export async function patchOwnedBaby(
  harness: ConvexTestHarness,
  args: FunctionArgs<typeof api.baby.update>,
) {
  await harness.client.mutation(api.baby.update, args);
}

/** Posts a timeline update with omitted fields as explicit `null`. */
export async function postTestUpdate(
  harness: ConvexTestHarness,
  opts: Pick<FunctionArgs<typeof api.updates.post>, "babyId"> &
    Partial<FunctionArgs<typeof api.updates.post>>,
) {
  return await harness.client.mutation(api.updates.post, {
    message: null,
    milestone: null,
    occurredAt: null,
    photoId: null,
    ...opts,
  });
}

/** Leaves a visitor encouragement on the baby timeline. */
export async function seedTimelineEncouragement(
  harness: ConvexTestHarness,
  opts: {
    authorName: string;
    babyId: Id<"baby">;
    message: string;
  },
) {
  await harness.client.mutation(api.encouragements.create, {
    authorName: opts.authorName,
    babyId: opts.babyId,
    locale: null,
    message: opts.message,
    timezone: null,
    userAgent: null,
    visitorId: "visitor-test",
  });
}
