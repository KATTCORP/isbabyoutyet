import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { makeAsyncResource } from "./test.resource";
import { createBabyArgs, modules, registerComponents } from "./test.setup";
import {
  deleteUpdateWithTimelineItem,
  insertEncouragementTimelineItem,
  insertUpdateWithTimelineItem,
  NEWER_THAN_ITEM_COUNT_CAP,
} from "./timeline";

async function setup() {
  const t = convexTest(schema, modules);
  registerComponents(t);
  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-09-01", name: "Baby Smith" }),
  );
  return makeAsyncResource({ asAlice, babyId: created.babyId, t }, async () => {
    await t.finishAllScheduledFunctions(() => {});
  });
}

type Harness = Awaited<ReturnType<typeof setup>>;

type SeedRow = { kind: "encouragement" | "update"; label: string; postedAt: number };

/**
 * Inserts feed rows in array order (so `_creationTime` follows it) and
 * returns their timeline ids by label.
 */
async function seedFeed(harness: Harness, rows: ReadonlyArray<SeedRow>) {
  const seeded = await harness.t.run(async (ctx) => {
    const ids: Record<string, Id<"timelineItems">> = {};
    for (const row of rows) {
      if (row.kind === "update") {
        const inserted = await insertUpdateWithTimelineItem(ctx, {
          babyId: harness.babyId,
          message: row.label,
          postedAt: row.postedAt,
        });
        ids[row.label] = inserted.timelineItemId;
        continue;
      }
      const timelineItemId = await insertEncouragementTimelineItem(ctx, {
        babyId: harness.babyId,
        postedAt: row.postedAt,
      });
      await ctx.db.insert("encouragements", {
        author: { type: "visitor", visitorId: "visitor-secret" },
        authorName: "Grandma",
        babyId: harness.babyId,
        createdAt: row.postedAt,
        message: row.label,
        timelineItemId,
        visitorId: "visitor-secret",
      });
      ids[row.label] = timelineItemId;
    }
    return ids;
  });
  return new Map(Object.entries(seeded));
}

function idOf(ids: Map<string, Id<"timelineItems">>, label: string) {
  const id = ids.get(label);
  if (!id) {
    throw new Error(`No seeded row ${label}`);
  }
  return id;
}

function labelOf(item: {
  encouragement?: { message: string };
  kind: string;
  update?: { message: string | null };
}) {
  return item.kind === "update" ? item.update?.message : item.encouragement?.message;
}

/** Ten rows alternating updates and encouragements, `m0` oldest. */
function alternatingRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    kind: index % 2 === 0 ? ("update" as const) : ("encouragement" as const),
    label: `m${index}`,
    postedAt: 1000 + index,
  }));
}

type ReadAllOpts = { context?: number; itemId: string; numItems: number };

/** Every page a linked feed reads in `direction`, as labels in reading order. */
async function readAllPages(
  harness: Harness,
  opts: ReadAllOpts & { direction: "backward" | "forward" },
) {
  const labels: Array<string | null | undefined> = [];
  let cursor: string | null = null;
  for (;;) {
    const result: FunctionReturnType<typeof api.timeline.listFeed> = await harness.t.query(
      api.timeline.listFeed,
      {
        babyId: harness.babyId,
        context: opts.context ?? 0,
        direction: opts.direction,
        from: opts.itemId,
        paginationOpts: { cursor, numItems: opts.numItems },
      },
    );
    labels.push(...result.page.map(labelOf));
    if (result.isDone) {
      return labels;
    }
    cursor = result.continueCursor;
  }
}

function readAllFromItem(harness: Harness, opts: ReadAllOpts) {
  return readAllPages(harness, { ...opts, direction: "forward" });
}

function readAllNewer(harness: Harness, opts: ReadAllOpts) {
  return readAllPages(harness, { ...opts, direction: "backward" });
}

/** The `before` a linked feed's first page carries. */
async function newerCountOf(harness: Harness, opts: { context?: number; itemId: string }) {
  const first = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: opts.context ?? 0,
    direction: "forward",
    from: opts.itemId,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  return first.before;
}

test("a linked item starts the feed and pages older across updates and encouragements", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(10));

  const first = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 0,
    direction: "forward",
    from: idOf(ids, "m6"),
    paginationOpts: { cursor: null, numItems: 3 },
  });
  expect(first.linkUnavailable).toBe(false);
  expect(first.page.map(labelOf)).toEqual(["m6", "m5", "m4"]);
  expect(first.page.map((item) => item.kind)).toEqual(["update", "encouragement", "update"]);
  expect(first.page[0]?._id).toBe(idOf(ids, "m6"));
  expect(first.isDone).toBe(false);

  expect(await readAllFromItem(harness, { itemId: idOf(ids, "m6"), numItems: 3 })).toEqual([
    "m6",
    "m5",
    "m4",
    "m3",
    "m2",
    "m1",
    "m0",
  ]);
});

test("context starts the feed a few items above the link, and the rest stay newer", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(10));
  const itemId = idOf(ids, "m6");

  const first = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 2,
    direction: "forward",
    from: itemId,
    paginationOpts: { cursor: null, numItems: 4 },
  });
  expect(first).toMatchObject({ before: { count: 1, more: false }, linkUnavailable: false });
  expect(first.page.map(labelOf)).toEqual(["m8", "m7", "m6", "m5"]);
  const next = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 2,
    direction: "forward",
    from: itemId,
    paginationOpts: { cursor: first.continueCursor, numItems: 4 },
  });
  expect(next).toMatchObject({ before: null, isDone: false, linkUnavailable: false });
  expect(next.page.map(labelOf)).toEqual(["m4", "m3", "m2", "m1"]);
  expect(await readAllNewer(harness, { context: 2, itemId, numItems: 10 })).toEqual(["m9"]);

  // Near the top, the window starts at the newest item.
  const nearTop = idOf(ids, "m8");
  expect(await newerCountOf(harness, { context: 5, itemId: nearTop })).toEqual({
    count: 0,
    more: false,
  });
  expect(await readAllFromItem(harness, { context: 5, itemId: nearTop, numItems: 3 })).toEqual(
    alternatingRows(10)
      .map((row) => row.label)
      .toReversed(),
  );
  expect(await readAllNewer(harness, { context: 5, itemId: nearTop, numItems: 3 })).toEqual([]);
});

test("a removed row above the link still counts towards its context", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(6));
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(idOf(ids, "m3"), { deletedAt: 5000 });
  });
  const itemId = idOf(ids, "m2");

  expect(await readAllFromItem(harness, { context: 2, itemId, numItems: 10 })).toEqual([
    "m4",
    "m2",
    "m1",
    "m0",
  ]);
  expect(await readAllNewer(harness, { context: 2, itemId, numItems: 10 })).toEqual(["m5"]);
});

test("newer items page upwards from the link, and both directions tile the feed", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(10));
  const itemId = idOf(ids, "m3");

  const firstNewer = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 0,
    direction: "backward",
    from: itemId,
    paginationOpts: { cursor: null, numItems: 2 },
  });
  expect(firstNewer.page.map(labelOf)).toEqual(["m4", "m5"]);

  const newer = await readAllNewer(harness, { itemId, numItems: 2 });
  expect(newer).toEqual(["m4", "m5", "m6", "m7", "m8", "m9"]);
  const older = await readAllFromItem(harness, { itemId, numItems: 4 });

  const feed = await harness.t.query(api.timeline.listByBaby, {
    babyId: harness.babyId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect([...newer.toReversed(), ...older]).toEqual(feed.page.map(labelOf));

  expect(await newerCountOf(harness, { itemId })).toEqual({ count: 6, more: false });
});

test("each newer page says how many shown items are still above it", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(10));
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(idOf(ids, "m9"), { deletedAt: 5000 });
  });
  const args = { babyId: harness.babyId, context: 0, from: idOf(ids, "m3") };

  const first = await harness.t.query(api.timeline.listFeed, {
    ...args,
    direction: "forward",
    paginationOpts: { cursor: null, numItems: 2 },
  });
  // m4–m8: m9 is removed.
  expect(first.before).toEqual({ count: 5, more: false });
  const newer = { ...args, direction: "backward" as const };
  const befores: Array<unknown> = [];
  let cursor: string | null = null;
  for (;;) {
    const page: FunctionReturnType<typeof api.timeline.listFeed> = await harness.t.query(
      api.timeline.listFeed,
      { ...newer, paginationOpts: { cursor, numItems: 2 } },
    );
    befores.push({ before: page.before, labels: page.page.map(labelOf) });
    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }
  expect(befores).toEqual([
    { before: { count: 3, more: false }, labels: ["m4", "m5"] },
    { before: { count: 1, more: false }, labels: ["m6", "m7"] },
    { before: { count: 0, more: false }, labels: ["m8"] },
  ]);
});

test("items posted in the same millisecond keep one order on both sides of the link", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, [
    { kind: "update", label: "before", postedAt: 1000 },
    { kind: "encouragement", label: "tie-a", postedAt: 2000 },
    { kind: "update", label: "tie-b", postedAt: 2000 },
    { kind: "encouragement", label: "tie-c", postedAt: 2000 },
    { kind: "update", label: "after", postedAt: 3000 },
  ]);
  const feed = await harness.t.query(api.timeline.listByBaby, {
    babyId: harness.babyId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(feed.page.map(labelOf)).toEqual(["after", "tie-c", "tie-b", "tie-a", "before"]);

  const itemId = idOf(ids, "tie-b");
  expect(await readAllFromItem(harness, { itemId, numItems: 1 })).toEqual([
    "tie-b",
    "tie-a",
    "before",
  ]);
  expect(await readAllNewer(harness, { itemId, numItems: 1 })).toEqual(["tie-c", "after"]);
  expect(await newerCountOf(harness, { itemId })).toEqual({ count: 2, more: false });
});

test("removed items stay out of every direction and the count", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(6));
  await harness.t.run(async (ctx) => {
    for (const label of ["m1", "m4"]) {
      const update = await ctx.db
        .query("updates")
        .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", idOf(ids, label)))
        .first();
      if (update) {
        await deleteUpdateWithTimelineItem(ctx, update);
        continue;
      }
      await ctx.db.patch(idOf(ids, label), { deletedAt: 5000 });
    }
  });
  const itemId = idOf(ids, "m2");

  expect(await readAllFromItem(harness, { itemId, numItems: 2 })).toEqual(["m2", "m0"]);
  expect(await readAllNewer(harness, { itemId, numItems: 2 })).toEqual(["m3", "m5"]);
  expect(await newerCountOf(harness, { itemId })).toEqual({ count: 2, more: false });
});

test("a removed linked item is reported hidden but still holds the window in place", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(5));
  const itemId = idOf(ids, "m2");
  await harness.t.run(async (ctx) => {
    const update = await ctx.db
      .query("updates")
      .withIndex("by_timelineItemId", (q) => q.eq("timelineItemId", itemId))
      .first();
    if (!update) {
      throw new Error("m2 should be an update");
    }
    await deleteUpdateWithTimelineItem(ctx, update);
  });

  const result = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 0,
    direction: "forward",
    from: itemId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(result.linkUnavailable).toBe(true);
  expect(result.page.map(labelOf)).toEqual(["m1", "m0"]);
  expect(await readAllNewer(harness, { itemId, numItems: 10 })).toEqual(["m3", "m4"]);
});

test("no link reads the latest feed, with nothing newer", async () => {
  await using harness = await setup();
  await seedFeed(harness, alternatingRows(5));
  const args = { babyId: harness.babyId, context: 2, from: null };

  const first = await harness.t.query(api.timeline.listFeed, {
    ...args,
    direction: "forward",
    paginationOpts: { cursor: null, numItems: 3 },
  });
  expect(first).toMatchObject({ before: { count: 0, more: false }, linkUnavailable: false });
  expect(first.page.map(labelOf)).toEqual(["m4", "m3", "m2"]);
  expect(
    await harness.t.query(api.timeline.listFeed, {
      ...args,
      direction: "backward",
      paginationOpts: { cursor: null, numItems: 3 },
    }),
  ).toMatchObject({ before: { count: 0, more: false }, isDone: true, page: [] });
});

test("unknown, malformed, and other pages' ids read the latest feed", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(3));
  const other = await harness.asAlice.mutation(
    api.baby.create,
    createBabyArgs({ dueDate: "2026-10-01", name: "Other Baby" }),
  );
  const otherItem = await harness.t.run(async (ctx) => {
    const inserted = await insertUpdateWithTimelineItem(ctx, {
      babyId: other.babyId,
      message: "other page",
      postedAt: 1500,
    });
    return inserted.timelineItemId;
  });
  const deletedId = idOf(ids, "m0");
  await harness.t.run(async (ctx) => {
    await ctx.db.delete(deletedId);
  });

  for (const itemId of ["not-an-id", "", otherItem, deletedId, other.babyId]) {
    const args = { babyId: harness.babyId, context: 2, from: itemId };
    const first = await harness.t.query(api.timeline.listFeed, {
      ...args,
      direction: "forward",
      paginationOpts: { cursor: null, numItems: 1 },
    });
    expect(first).toMatchObject({
      before: { count: 0, more: false },
      isDone: false,
      linkUnavailable: true,
    });
    expect(first.page.map(labelOf)).toEqual(["m2"]);
    const next = await harness.t.query(api.timeline.listFeed, {
      ...args,
      direction: "forward",
      paginationOpts: { cursor: first.continueCursor, numItems: 10 },
    });
    expect(next).toMatchObject({ before: null, isDone: true, linkUnavailable: true });
    expect(next.page.map(labelOf)).toEqual(["m1"]);
    expect(
      await harness.t.query(api.timeline.listFeed, {
        ...args,
        direction: "backward",
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).toMatchObject({ before: { count: 0, more: false }, isDone: true, page: [] });
  }

  // The same link works on its own page, addressed by public slug.
  const otherBaby = await harness.t.query(api.baby.getByPublicId, { id: other.babyId });
  const onOwnPage = await harness.t.query(api.timeline.listFeed, {
    babyId: otherBaby?.publicId ?? "",
    context: 0,
    direction: "forward",
    from: otherItem,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(onOwnPage.page.map(labelOf)).toEqual(["other page"]);
});

test("a deleted baby page reads nothing through a link", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(2));
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(harness.babyId, { deletedAt: 9000 });
  });

  const result = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 0,
    direction: "forward",
    from: idOf(ids, "m1"),
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(result).toMatchObject({ linkUnavailable: true, page: [] });
});

test("linked pages use the feed's public encouragement shape", async () => {
  await using harness = await setup();
  const ids = await seedFeed(harness, alternatingRows(2));

  const result = await harness.t.query(api.timeline.listFeed, {
    babyId: harness.babyId,
    context: 0,
    direction: "forward",
    from: idOf(ids, "m1"),
    paginationOpts: { cursor: null, numItems: 10 },
  });
  const encouragement = result.page.find((item) => item.kind === "encouragement");
  expect(encouragement?.kind === "encouragement" && Object.keys(encouragement.encouragement))
    .toMatchInlineSnapshot(`
    [
      "_id",
      "authorName",
      "createdAt",
      "isMine",
      "message",
      "visitorTag",
    ]
  `);
  expect(JSON.stringify(result)).not.toContain("visitor-secret");
});

test("the newer count stops reading at its cap", async () => {
  await using harness = await setup();
  const ids = await seedFeed(
    harness,
    Array.from({ length: NEWER_THAN_ITEM_COUNT_CAP + 3 }, (_, index) => ({
      kind: "update" as const,
      label: `m${index}`,
      postedAt: 1000 + index,
    })),
  );

  expect(await newerCountOf(harness, { itemId: idOf(ids, "m0") })).toEqual({
    count: NEWER_THAN_ITEM_COUNT_CAP,
    more: true,
  });
  expect(await newerCountOf(harness, { itemId: idOf(ids, "m3") })).toEqual({
    count: NEWER_THAN_ITEM_COUNT_CAP - 1,
    more: false,
  });
});
