import { getData } from "@raf-query/react";
import type { AppQueryClient } from "@/lib/query-client";
import { isFunction, isPlainObject } from "@workspace/runtime/guards";
import type { JsonValue } from "@workspace/runtime/json";
import { convexTest } from "convex-test";
import type { FunctionReturnType, PaginationResult } from "convex/server";
import { getFunctionName } from "convex/server";
import type { RenderResult } from "@testing-library/react";
import { fireEvent, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { clearBrowserCookies } from "@/test/browserCookies";
import { StatusDisplay } from "@/components/baby/status-display";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import schema from "@isbabyoutyet/backend/convex/schema";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import {
  createBabyArgs,
  modules,
  registerComponents,
} from "@isbabyoutyet/backend/convex/test.setup";
import type { BabyData } from "@isbabyoutyet/backend/src/types";
import {
  FORBIDDEN,
  DEFAULT_MILESTONE_VISIBILITY,
  getCurrentStatus,
} from "@isbabyoutyet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { convexQuery } from "@workspace/convex-query";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { getBabySeo } from "@/lib/seo";
import { TIMELINE_PAGE_SIZE, timelineInput, timelineQuery } from "@/lib/timeline-feed";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby, seedTimelineEncouragement } from "@/test/convexTestSeed";
import { htmlElement } from "@/test/htmlElement";
import {
  renderMountedFileRoute,
  renderMountedFileRouteWithPreloads,
} from "@/test/renderMountedFileRoute";
import { loadQuery } from "@/test/loadQuery";

const routeModule = await import("@/routes/baby/$publicId/route");
const shareRouteModule = await import("@/routes/baby/$publicId/share");
const loginRouteModule = await import("@/routes/baby/$publicId/login");
const { docToBabyData, managerDocToBabyData } = routeModule;

test("shares a baby's page until its data changes or its day ends, and nothing without a baby", () => {
  // @ts-expect-error — stub opts are the fields headers reads
  const headers: (opts: {
    loaderData: { babyDoc: { _id: string; timeZone: string } } | undefined;
    params: { publicId: string };
  }) => Record<string, string> = routeModule.Route.options.headers;
  const found = headers({
    loaderData: { babyDoc: { _id: "j57abc", timeZone: "Europe/London" } },
    params: { publicId: "sam-smith" },
  });
  // A 404, or a redirect to the baby's current public id.
  const missing = headers({ loaderData: undefined, params: { publicId: "sam-smith" } });

  expect(found).toMatchObject({
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Vercel-Cache-Tag": "baby:j57abc",
    "Vercel-CDN-Cache-Control": expect.stringMatching(/^public, s-maxage=\d+$/),
    "X-Robots-Tag": "noindex, nofollow",
  });
  expect(found).not.toHaveProperty("Vary");
  expect(missing).toEqual({ "X-Robots-Tag": "noindex, nofollow" });
});

function useFakeTimersResource(now: Date) {
  vi.useFakeTimers({ now });
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

type PublicBaby = NonNullable<FunctionReturnType<typeof api.baby.getByPublicId>>;

/**
 * Happy-path stand-in for the baby detail page: heading + status from
 * data loaded via convex-test (in-memory local Convex).
 */
function BabyDetailPage(props: { baby: PublicBaby }) {
  const baby = docToBabyData(props.baby);
  const currentStatus = getCurrentStatus(baby);

  return (
    <div>
      <h1>Is {baby.name} out yet?</h1>
      <StatusDisplay
        baby={baby}
        blurDataUrl={null}
        currentStatus={currentStatus}
        latestUpdate={null}
        photoUrl={null}
        publicId={null}
        thumbnailUrl={null}
      />
    </div>
  );
}

test("renders a baby detail page from local convex-test data", async () => {
  // Freeze "now" so StatusDisplay's until-due / overdue copy stays deterministic
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));

  const t = convexTest(schema, modules);
  await registerComponents(t);

  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      name: "Baby Smith",
    }),
  );

  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(baby).toMatchObject({
    dueDate: "2026-09-01",
    name: "Baby Smith",
    publicId: "baby-smith",
  });
  if (!baby) {
    throw new Error("expected baby from getByPublicId");
  }
  expect(baby).not.toHaveProperty("publicDueDateText");
  const managerDoc = await asAlice.query(api.baby.getManagerBaby, { babyId: created.babyId });
  if (managerDoc === FORBIDDEN) {
    throw new Error("expected manager baby");
  }
  expect(managerDocToBabyData(managerDoc)).toMatchObject({
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    publicDueDateText: null,
  });
  expect(
    docToBabyData({
      ...baby,
      babyBorn: "2026-08-11T03:00:00.000Z",
      laborStarted: "2026-08-10T08:00:00.000Z",
      locale: "sv",
      theme: "baby-blue",
      wentToHospital: "2026-08-10T12:00:00.000Z",
      // SAFETY: Seeded convex-test document id.
      photoId: "photo-id" as Id<"_storage">,
    }),
  ).toMatchObject({
    babyBorn: "2026-08-11T03:00:00.000Z",
    laborStarted: "2026-08-10T08:00:00.000Z",
    locale: "sv",
    photoId: "photo-id",
    theme: "baby-blue",
    wentToHospital: "2026-08-10T12:00:00.000Z",
  });
  expect(
    managerDocToBabyData({
      ...managerDoc,
      locale: "sv",
      publicDueDateText: "Retained message",
      theme: "baby-blue",
      // SAFETY: Seeded convex-test document id.
      photoId: "photo-id" as Id<"_storage">,
    }),
  ).toMatchObject({
    locale: "sv",
    photoId: "photo-id",
    publicDueDateText: "Retained message",
    theme: "baby-blue",
  });

  await using view = await renderWithTestRouter(<BabyDetailPage baby={baby} />);

  expect(view.getByRole("heading", { name: "Is Baby Smith out yet?" })).toBeTruthy();
  expect(view.getByText("Not yet")).toBeTruthy();
  expect(view.getByText("Baby is still on the way")).toBeTruthy();
  expect(view.getByText("21 days until due date")).toBeTruthy();
  expect(view.getByText("Due date: 1 September 2026")).toBeTruthy();
});

test("renders optional public due date text without exposing the exact day", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const created = await t.withIdentity({ subject: "alice" }).mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: null,
      dueDateDisplayMode: "message",
      name: "Baby Smith",
      publicDueDateText: "Any day now",
    }),
  );
  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  if (!baby) {
    throw new Error("expected baby from getByPublicId");
  }
  expect(baby).not.toHaveProperty("dueDate");
  const managerDoc = await t
    .withIdentity({ subject: "alice" })
    .query(api.baby.getManagerBaby, { babyId: created.babyId });
  if (managerDoc === FORBIDDEN) {
    throw new Error("expected manager baby");
  }
  expect(managerDocToBabyData(managerDoc)).toMatchObject({
    dueDate: null,
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });

  await using view = await renderWithTestRouter(<BabyDetailPage baby={baby} />);
  expect(view.getByText("Any day now")).toBeTruthy();
  expect(view.queryByText(/until due date/)).toBeNull();
  expect(view.queryByText(/19 September/)).toBeNull();
});

test("hides the due date box when message mode has no public text", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const t = convexTest(schema, modules);
  await registerComponents(t);
  const created = await t.withIdentity({ subject: "alice" }).mutation(
    api.baby.create,
    createBabyArgs({
      dueDate: "2026-09-01",
      dueDateDisplayMode: "message",
      name: "Baby Smith",
      publicDueDateText: null,
    }),
  );
  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  if (!baby) {
    throw new Error("expected baby from getByPublicId");
  }
  expect(baby).toMatchObject({ dueDateDisplayMode: "message" });
  if ("publicDueDateText" in baby) {
    expect(baby.publicDueDateText).toBeUndefined();
  }
  expect(baby).not.toHaveProperty("dueDate");

  await using view = await renderWithTestRouter(<BabyDetailPage baby={baby} />);
  expect(view.getByText("Not yet")).toBeTruthy();
  expect(view.queryByText(/until due date/)).toBeNull();
  expect(view.queryByText(/Due date:/)).toBeNull();
});

test("renders the public baby status in the baby's Swedish override", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const baby: BabyData = {
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    laborStarted: null,
    name: "Nova",
    publicDueDateText: null,
    timeZone: "Europe/London",
    wentToHospital: null,
  };

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="sv">
      <StatusDisplay
        baby={baby}
        blurDataUrl={null}
        currentStatus={getCurrentStatus(baby)}
        latestUpdate={null}
        photoUrl={null}
        publicId={null}
        thumbnailUrl={null}
      />
    </LocaleProvider>,
  );

  expect(view.getByText("Inte än")).toBeTruthy();
  expect(view.getByText("Bäbisen är fortfarande på väg")).toBeTruthy();
  expect(view.getByText("Beräknat datum: 1 september 2026")).toBeTruthy();
});

test("renders the public baby status in Brazilian Portuguese", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const baby: BabyData = {
    babyBorn: null,
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    laborStarted: null,
    name: "Nova",
    publicDueDateText: null,
    timeZone: "Europe/London",
    wentToHospital: null,
  };

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="pt-BR">
      <StatusDisplay
        baby={baby}
        blurDataUrl={null}
        currentStatus={getCurrentStatus(baby)}
        latestUpdate={null}
        photoUrl={null}
        publicId={null}
        thumbnailUrl={null}
      />
    </LocaleProvider>,
  );

  expect(view.getByText("Ainda não")).toBeTruthy();
  expect(view.getByText("O bebê ainda está a caminho")).toBeTruthy();
  expect(view.getByText("Data prevista: 1 de setembro de 2026")).toBeTruthy();
});

// --- Route loader: awaited handles plus the owner/visitor branching ---

const BABY_DOC = {
  // SAFETY: Seeded convex-test document id.
  _id: "baby-1" as Id<"baby">,
  publicId: "baby-smith",
  resolvedLocale: "en-GB",
} satisfies Partial<PublicBaby>;
const EMPTY_PAGE = {
  continueCursor: "",
  isDone: true,
  page: [],
} satisfies PaginationResult<never>;

type QueryHandlers = Record<string, JsonValue>;
type BabyLoaderResult = {
  baby: unknown;
  babyDoc: { resolvedLocale: string };
  browserPush: unknown;
  latestUpdate: unknown;
  managerBaby: unknown;
  me: unknown;
  myAccess: unknown;
  onboarding: unknown;
  scheduledNotifications: unknown;
  subscriptionCount: unknown;
  timeline: unknown;
  vapidPublicKey: unknown;
};
type RouteContextStub = { context: { queryClient: AppQueryClient } };

type QueryRunner = Parameters<typeof stubQueryClientResource>[0];

/** Answers by function name; `read` collects every name asked for. */
function answerByName(handlers: QueryHandlers, read: Array<string>) {
  return (query: Parameters<QueryRunner>[0]) => {
    const name = getFunctionName(query);
    read.push(name);
    return Promise.resolve(name in handlers ? handlers[name] : null);
  };
}

/** A browser query client answering by function name, see {@link answerByName}. */
function loaderQueryClientResource(handlers: QueryHandlers, read: Array<string> = []) {
  return stubQueryClientResource(answerByName(handlers, read));
}

// @ts-expect-error — stub opts are the fields the loader reads
const loader: (
  opts: RouteContextStub & {
    deps: { item: string | null };
    location: { href: string };
    params: { publicId: string };
  },
) => Promise<BabyLoaderResult> = routeModule.Route.options.loader;

async function runBabyLoader(
  queryClient: AppQueryClient,
  opts: { item: string | null } = { item: null },
) {
  return await loader({
    context: { queryClient },
    deps: { item: opts.item },
    location: { href: "/baby/baby-smith" },
    params: { publicId: "baby-smith" },
  });
}

test("loader loads the same set for visitors; gated queries come back forbidden", async () => {
  // This visitor has never posted, whatever an earlier test left behind.
  clearBrowserCookies();
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": BABY_DOC,
    "baby:getManagerBaby": "forbidden",
    "baby:getScheduledNotifications": "forbidden",
    "coParents:myAccess": { canManage: false, isOwner: false },
    "pushSubscriptions:getSubscriptionCount": "forbidden",
    "timeline:listFeed": EMPTY_PAGE,
  });
  const queryClient = stub.queryClient;
  const result = await runBabyLoader(queryClient);

  expect(result.baby).toMatchObject({ input: { id: "baby-smith" } });
  expect(result.timeline).toMatchObject({
    input: timelineInput({ from: null, publicId: "baby-smith" }),
  });
  expect(getData(queryClient, convexQuery(api.baby.getByPublicId), { id: "baby-smith" })).toEqual(
    BABY_DOC,
  );
  expect(
    getData(queryClient, convexQuery(api.coParents.myAccess), { babyId: "baby-smith" }),
  ).toMatchObject({
    canManage: false,
  });
  expect(getData(queryClient, convexQuery(api.baby.getManagerBaby), { babyId: "baby-smith" })).toBe(
    "forbidden",
  );
  expect(
    getData(queryClient, convexQuery(api.baby.getScheduledNotifications), { babyId: "baby-smith" }),
  ).toBe("forbidden");
  expect(
    getData(queryClient, convexQuery(api.pushSubscriptions.getSubscriptionCount), {
      babyId: "baby-smith",
    }),
  ).toBe("forbidden");
});

test("loader gives managers the same handles with real data", async () => {
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": BABY_DOC,
    "baby:getManagerBaby": { ...BABY_DOC, birthJourney: "labor" },
    "baby:getScheduledNotifications": [],
    "coParents:myAccess": { canManage: true, isOwner: true },
    "pushSubscriptions:getSubscriptionCount": 2,
    "timeline:listFeed": EMPTY_PAGE,
  });
  const queryClient = stub.queryClient;
  const result = await runBabyLoader(queryClient);

  expect(result.scheduledNotifications).toMatchObject({ input: { babyId: "baby-smith" } });
  expect(result.subscriptionCount).toMatchObject({ input: { babyId: "baby-smith" } });
  expect(result.onboarding).toMatchObject({ input: {} });
  expect(getData(queryClient, convexQuery(api.onboarding.getMine), {})).toBeNull();
  expect(
    getData(queryClient, convexQuery(api.baby.getScheduledNotifications), { babyId: "baby-smith" }),
  ).toEqual([]);
  expect(
    getData(queryClient, convexQuery(api.pushSubscriptions.getSubscriptionCount), {
      babyId: "baby-smith",
    }),
  ).toBe(2);
  expect(
    getData(queryClient, convexQuery(api.baby.getManagerBaby), { babyId: "baby-smith" }),
  ).toMatchObject({
    birthJourney: "labor",
  });
});

test("an unknown baby is a 404", async () => {
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": null,
    "timeline:listFeed": EMPTY_PAGE,
  });

  await expect(runBabyLoader(stub.queryClient)).rejects.toMatchObject({ isNotFound: true });
});

test("the loader data carries the baby's language for the document", async () => {
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": { ...BABY_DOC, resolvedLocale: "sv" },
    "timeline:listFeed": EMPTY_PAGE,
  });

  const data = await runBabyLoader(stub.queryClient);

  expect(data.babyDoc.resolvedLocale).toBe("sv");
});

test("a public id the baby no longer goes by redirects and keeps the subpath", async () => {
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": BABY_DOC,
    "timeline:listFeed": EMPTY_PAGE,
  });

  await expect(
    loader({
      context: { queryClient: stub.queryClient },
      deps: { item: null },
      location: { href: "/baby/old-slug/settings" },
      params: { publicId: "old-slug" },
    }),
  ).rejects.toMatchObject({
    options: {
      href: "/baby/baby-smith/settings",
      replace: true,
    },
  });
});

test("loader prefetches browser push capability on the client", async () => {
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": BABY_DOC,
    "timeline:listFeed": EMPTY_PAGE,
  });
  const queryClient = stub.queryClient;
  await runBabyLoader(queryClient);

  await vi.waitFor(() => {
    expect(getData(queryClient, browserPushCapabilityQuery, "baby-smith")).toEqual({
      kind: "unsupported",
    });
  });
});

test("a linked item loads its feed in the same load as the rest of the page", async () => {
  const read: Array<string> = [];
  const pageSizes: Array<string> = [];
  const answer = answerByName(
    {
      "baby:getByPublicId": BABY_DOC,
      "timeline:listFeed": {
        ...EMPTY_PAGE,
        linkUnavailable: false,
        newerCount: { count: 3, more: false },
        page: [{ _id: "k57above" }, { _id: "k57linked" }],
      },
    },
    read,
  );
  // Held until the feed is asked for: anything waiting on another read never settles.
  const feedRead = Promise.withResolvers<void>();
  await using stub = stubQueryClientResource(async (query, args) => {
    const value = await answer(query);
    if ("paginationOpts" in args && isPlainObject(args.paginationOpts)) {
      pageSizes.push(`${getFunctionName(query)} ${String(args.paginationOpts.numItems)}`);
    }
    if (getFunctionName(query) !== "baby:getByPublicId") {
      await feedRead.promise;
    }
    return value;
  });
  const loaded = runBabyLoader(stub.queryClient, { item: "k57linked" });

  await vi.waitFor(() => {
    expect(read).toContain("timeline:listFeed");
  });
  feedRead.resolve();
  const result = await loaded;

  expect(result.timeline).toMatchObject({
    input: timelineInput({ from: "k57linked", publicId: "baby-smith" }),
  });
  // The items above the link come with its first page; newer ones wait for "Show more".
  expect(pageSizes).toEqual([`timeline:listFeed ${TIMELINE_PAGE_SIZE}`]);
});

test("an item the feed on screen shows keeps that feed, reading nothing", async () => {
  const read: Array<string> = [];
  await using stub = loaderQueryClientResource(
    {
      "baby:getByPublicId": BABY_DOC,
      "timeline:listFeed": { ...EMPTY_PAGE, page: [{ _id: "k57shown" }] },
    },
    read,
  );
  await runBabyLoader(stub.queryClient);
  read.length = 0;

  await runBabyLoader(stub.queryClient, { item: "k57shown" });
  // And back again.
  await runBabyLoader(stub.queryClient);

  expect(read).toEqual([]);
  const feed = getData(
    stub.queryClient,
    timelineQuery,
    timelineInput({ from: null, publicId: "baby-smith" }),
  );
  expect(feed?.pageParams[0]?.from).toBeNull();
});

test("an item the feed on screen hasn't loaded starts the feed over at it", async () => {
  const read: Array<string> = [];
  await using stub = loaderQueryClientResource(
    {
      "baby:getByPublicId": BABY_DOC,
      "timeline:listFeed": { ...EMPTY_PAGE, page: [{ _id: "k57shown" }] },
    },
    read,
  );
  await runBabyLoader(stub.queryClient);
  read.length = 0;

  await runBabyLoader(stub.queryClient, { item: "k57older" });

  expect(read).toContain("timeline:listFeed");
  const feed = getData(
    stub.queryClient,
    timelineQuery,
    timelineInput({ from: "k57older", publicId: "baby-smith" }),
  );
  expect(feed?.pageParams[0]?.from).toBe("k57older");
});

test("docToBabyData coalesces missing public due date text to null", () => {
  expect(
    docToBabyData({
      _creationTime: 1,
      // SAFETY: Seeded convex-test document id.
      _id: "baby-1" as Id<"baby">,
      babyBorn: null,
      blurDataUrl: null,
      dueDateDisplayMode: "message",
      laborStarted: null,
      locale: "en-GB",
      milestoneVisibility: DEFAULT_MILESTONE_VISIBILITY,
      name: "Nova",
      ogImageHash: "testhash",
      photoUrl: null,
      publicDueDateText: undefined,
      publicId: "nova",
      resolvedLocale: "en-GB",
      theme: "baby-blue",
      thumbnailUrl: null,
      timeZone: "Europe/London",
      wentToHospital: null,
    }),
  ).toMatchObject({
    dueDateDisplayMode: "message",
    publicDueDateText: null,
  });
});

test("share preview uses the canonical route slug while reactive baby data changes", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const seo = getBabySeo(
    {
      _creationTime: 1,
      // SAFETY: Seeded convex-test document id.
      _id: "baby-1" as Id<"baby">,
      babyBorn: null,
      blurDataUrl: null,
      dueDateDisplayMode: "message",
      laborStarted: null,
      locale: "en-GB",
      milestoneVisibility: DEFAULT_MILESTONE_VISIBILITY,
      name: "Alba Willis",
      ogImageHash: "testhash",
      photoUrl: null,
      publicDueDateText: undefined,
      publicId: "alba-willis-1",
      resolvedLocale: "en-GB",
      theme: "baby-blue",
      thumbnailUrl: null,
      timeZone: "Europe/London",
      wentToHospital: null,
    },
    "alba-willis",
  );

  expect(new URL(seo.imageUrl).pathname).toBe("/og/baby/alba-willis-testhash-20260811");
  expect(seo.canonical).toBe("https://isbabyoutyet.com/baby/alba-willis");
});

test("unknown or malformed search params never throw (PERSONAL-ISBABYOUTYET-7)", () => {
  expect(routeModule.babySearchSchema.parse({ beta: "true", item: 42, utm_source: "x" })).toEqual({
    item: "42",
  });
  expect(routeModule.babySearchSchema.parse({})).toEqual({});
});

test("logged-out visitors see a sign-in icon in the top dock", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  await harness.withIdentity(null);

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}`,
    overlayHistory: null,
    path: "/baby/$publicId",
    route: routeModule.Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });
  expect(ctx.view.getByRole("button", { name: "Sign in" }).getAttribute("href")).toBe(
    `/baby/${baby.publicId}/login`,
  );
  expect(ctx.view.queryByRole("button", { name: "Dashboard" })).toBeNull();
  expect(ctx.view.queryByText("Are you the parent? Sign in")).toBeNull();
});

test("owners see a dashboard icon instead of sign-in", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}`,
    overlayHistory: null,
    path: "/baby/$publicId",
    route: routeModule.Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("heading", { name: /Is Baby Smith out yet/i })).toBeTruthy();
  });
  expect(ctx.view.getByRole("button", { name: "Dashboard" }).getAttribute("href")).toBe(
    "/dashboard",
  );
  expect(ctx.view.queryByRole("button", { name: "Sign in" })).toBeNull();
  expect(ctx.view.queryByText("Are you the parent? Sign in")).toBeNull();
});

test("notification #feed landmark is the messages list, not the compose box", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: `/baby/${baby.publicId}`,
    overlayHistory: null,
    path: "/baby/$publicId",
    route: routeModule.Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("heading", { name: "Updates & messages" })).toBeTruthy();
  });

  const feed = document.getElementById("feed");
  expect(feed).toBeTruthy();
  expect(feed?.contains(ctx.view.getByRole("heading", { name: "Updates & messages" }))).toBe(true);
  expect(feed?.contains(ctx.view.getByLabelText("Message"))).toBe(false);
});

// --- Following an item's timestamp: highlight in place, or open the feed at it ---

type SeededFeedMessages = {
  itemId: (
    message: string,
  ) => FunctionReturnType<typeof api.timeline.listByBaby>["page"][number]["_id"];
  publicId: string;
};

/** `Message 1` (oldest) to `Message {count}` (newest), posted by a visitor. */
async function seedFeedMessages(
  harness: ConvexTestHarness,
  opts: { count: number },
): Promise<SeededFeedMessages> {
  const baby = await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
  for (let index = 1; index <= opts.count; index++) {
    await seedTimelineEncouragement(harness, {
      authorName: "Family",
      babyId: baby.babyId,
      message: `Message ${index}`,
    });
  }
  await harness.withIdentity(null);
  const all = await harness.client.query(api.timeline.listByBaby, {
    babyId: baby.publicId,
    paginationOpts: { cursor: null, numItems: opts.count },
  });
  const itemIds = new Map(
    all.page.flatMap((item) =>
      item.kind === "encouragement" ? [[item.encouragement.message, item._id] as const] : [],
    ),
  );
  return {
    itemId: (message: string) => {
      const itemId = itemIds.get(message);
      if (!itemId) {
        throw new Error(`${message} missing`);
      }
      return itemId;
    },
    publicId: baby.publicId,
  };
}

async function renderBabyPage(harness: ConvexTestHarness, initialEntry: string) {
  return await renderMountedFileRoute({
    harness,
    initialEntry,
    overlayHistory: null,
    path: "/baby/$publicId",
    route: routeModule.Route,
    wrap: null,
  });
}

test("a baby that doesn't exist is a 404 against Convex, though its page's queries all ran", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  await using ctx = await renderBabyPage(harness, "/baby/no-such-baby");

  expect(
    ctx.router.state.matches.find((match) => match.routeId === routeModule.Route.id)?.status,
  ).toBe("notFound");
});

test("a baby opened by its document id goes to its public id", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: 1 });
  const babyId = await harness.t.run(async (db) => {
    const baby = await db.db
      .query("baby")
      .filter((q) => q.eq(q.field("publicId"), seeded.publicId))
      .unique();
    return baby?._id;
  });
  await using ctx = await renderBabyPage(harness, `/baby/${babyId}`);

  expect(ctx.router.state.location.pathname).toBe(`/baby/${seeded.publicId}`);
  await ctx.view.findByText("Message 1");
});

/** Every Convex query the page asks for from here on, and every scroll it makes. */
function watchFeedResource(harness: ConvexTestHarness) {
  // With no identity, the harness runs every live query through `t.query`.
  const query = vi.spyOn(harness.t, "query");
  const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
  const scrollTo = vi.spyOn(window, "scrollTo");
  return makeResource(
    {
      reads: () =>
        query.mock.calls.map((call) =>
          isFunction(call[0]) ? "inline query" : getFunctionName(call[0]),
        ),
      /** The elements scrolled into view, in order, and how often the window scrolled. */
      scrolled: () => ({
        intoView: scrollIntoView.mock.contexts,
        windowScrolls: scrollTo.mock.calls.length,
      }),
    },
    () => {
      query.mockRestore();
      scrollIntoView.mockRestore();
      scrollTo.mockRestore();
    },
  );
}

function messageRow(view: RenderResult, message: string) {
  return htmlElement(view.getByText(message).closest('[id^="item-"]'));
}

function highlightedRow(view: RenderResult) {
  return view.container.querySelector('[aria-current="true"]');
}

function followTimestamp(view: RenderResult, message: string) {
  fireEvent.click(
    within(messageRow(view, message)).getByRole("link", { name: /link to this message$/ }),
  );
}

/** The divider's button above a linked item and its context. */
const SHOW_MORE = /newer, Show \d+ more$/;

/** The latest feed with its second page loaded, as after scrolling to the skeleton. */
async function renderLatestFeedTwoPages(harness: ConvexTestHarness) {
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  await loadQuery(
    harness.queryClient,
    timelineQuery,
    timelineInput({ from: null, publicId: seeded.publicId }),
    { pages: 2 },
  );
  const ctx = await renderBabyPage(harness, `/baby/${seeded.publicId}`);
  await ctx.view.findByText("Message 1");
  return Object.assign(ctx, { itemId: seeded.itemId });
}

test("following a timestamp on the latest feed highlights the item in place", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  await using ctx = await renderLatestFeedTwoPages(harness);
  expect(highlightedRow(ctx.view)).toBeNull();
  using watched = watchFeedResource(harness);

  followTimestamp(ctx.view, "Message 2");

  const itemId = ctx.itemId("Message 2");
  await vi.waitFor(() => {
    expect(ctx.router.state.location.search).toEqual({ item: itemId });
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 2"));
  });
  expect(ctx.router.state.location.hash).toBe(`item-${itemId}`);
  expect(document.activeElement).toBe(messageRow(ctx.view, "Message 2"));
  expect(ctx.view.container.querySelectorAll('[id^="item-"]')).toHaveLength(TIMELINE_PAGE_SIZE + 2);
  expect(ctx.view.queryByRole("button", { name: SHOW_MORE })).toBeNull();
  expect(watched.reads()).toEqual([]);
  await vi.waitFor(() => {
    expect(watched.scrolled()).toEqual({
      intoView: [messageRow(ctx.view, "Message 2")],
      windowScrolls: 0,
    });
  });
});

test("going back after following a timestamp keeps the feed and clears the highlight", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  await using ctx = await renderLatestFeedTwoPages(harness);
  followTimestamp(ctx.view, "Message 2");
  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 2"));
  });
  using watched = watchFeedResource(harness);

  ctx.router.history.back();

  await vi.waitFor(() => {
    expect(ctx.router.state.location.search).toEqual({});
    expect(highlightedRow(ctx.view)).toBeNull();
  });
  expect(ctx.router.state.location.hash).toBe("");
  expect(ctx.view.container.querySelectorAll('[id^="item-"]')).toHaveLength(TIMELINE_PAGE_SIZE + 2);
  expect(watched.reads()).toEqual([]);
});

test("following a timestamp in a linked window keeps the window and moves the highlight", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: 6 });
  const linkedId = seeded.itemId("Message 2");
  await using ctx = await renderBabyPage(
    harness,
    `/baby/${seeded.publicId}?item=${linkedId}#item-${linkedId}`,
  );
  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 2"));
  });
  expect(ctx.view.getByText("Message 4")).toBeTruthy();
  expect(ctx.view.queryByText("Message 5")).toBeNull();
  fireEvent.click(ctx.view.getByRole("button", { name: "2 newer, Show 2 more" }));
  await ctx.view.findByText("Message 6");
  using watched = watchFeedResource(harness);

  followTimestamp(ctx.view, "Message 5");

  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 5"));
  });
  expect(document.activeElement).toBe(messageRow(ctx.view, "Message 5"));
  expect(ctx.router.state.location.search).toEqual({ item: seeded.itemId("Message 5") });
  expect(ctx.view.getByText("Message 6")).toBeTruthy();
  expect(ctx.view.getByText("Message 1")).toBeTruthy();
  expect(ctx.view.queryByRole("button", { name: SHOW_MORE })).toBeNull();
  expect(watched.reads()).toEqual([]);
  await vi.waitFor(() => {
    expect(watched.scrolled()).toEqual({
      intoView: [messageRow(ctx.view, "Message 5")],
      windowScrolls: 0,
    });
  });

  ctx.router.history.back();

  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 2"));
  });
  expect(ctx.view.getByText("Message 6")).toBeTruthy();
  expect(ctx.view.queryByText(/isn't here any more/)).toBeNull();
  expect(watched.reads()).toEqual([]);
});

test("following a context item's timestamp keeps the window and moves the highlight", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: 6 });
  const linkedId = seeded.itemId("Message 2");
  await using ctx = await renderBabyPage(
    harness,
    `/baby/${seeded.publicId}?item=${linkedId}#item-${linkedId}`,
  );
  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 2"));
  });
  using watched = watchFeedResource(harness);

  followTimestamp(ctx.view, "Message 4");

  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 4"));
  });
  expect(document.activeElement).toBe(messageRow(ctx.view, "Message 4"));
  expect(ctx.router.state.location.search).toEqual({ item: seeded.itemId("Message 4") });
  expect(
    Array.from(ctx.view.container.querySelectorAll('[id^="item-"]'), (row) =>
      row.textContent.match(/Message \d+/)?.at(0),
    ),
  ).toEqual(["Message 4", "Message 3", "Message 2", "Message 1"]);
  expect(ctx.view.getByRole("button", { name: "2 newer, Show 2 more" })).toBeTruthy();
  expect(watched.reads()).toEqual([]);
});

test("opening a link to an item starts the feed at it", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: 3 });
  const itemId = seeded.itemId("Message 2");

  await using ctx = await renderBabyPage(
    harness,
    `/baby/${seeded.publicId}?item=${itemId}#item-${itemId}`,
  );

  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 2"));
  });
  // The one newer item is its context, so there's nothing left to show.
  expect(ctx.view.getByText("Message 3")).toBeTruthy();
  expect(ctx.view.queryByRole("button", { name: SHOW_MORE })).toBeNull();
});

/**
 * Every element the page observes is in view at once, so the router
 * preloads every link on it, as scrolling past them all would.
 */
function everythingInViewResource() {
  class InView implements IntersectionObserver {
    readonly callback: IntersectionObserverCallback;
    readonly root = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds: ReadonlyArray<number> = [0];
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const rect = target.getBoundingClientRect();
      const entry: IntersectionObserverEntry = {
        boundingClientRect: rect,
        intersectionRatio: 1,
        intersectionRect: rect,
        isIntersecting: true,
        rootBounds: null,
        target,
        time: 0,
      };
      queueMicrotask(() => {
        this.callback([entry], this);
      });
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const original = globalThis.IntersectionObserver;
  vi.stubGlobal("IntersectionObserver", InView);
  return makeResource({}, () => {
    vi.stubGlobal("IntersectionObserver", original);
  });
}

test("every link on a linked feed's page can preload and leave the feed as it is", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  const itemId = seeded.itemId("Message 10");
  // "Jump to latest" above the feed, and the owner's overlay links
  // (settings, post, share), come into view with the rest.
  await using _inView = everythingInViewResource();
  // As the app routes it: links preload as they come into view, and the
  // overlays a visitor can open are there to preload.
  await using ctx = await renderBabyPageWithPreloads(
    harness,
    `/baby/${seeded.publicId}?item=${itemId}`,
  );
  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 10"));
  });
  await vi.waitFor(() => {
    expect(ctx.view.getByRole("link", { name: "Jump to latest" })).toBeTruthy();
  });
  // Let every preload run and settle.
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
  await harness.refresh();

  expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 10"));
  expect(ctx.view.getByText("Message 12")).toBeTruthy();
  expect(ctx.view.queryByText("Message 13")).toBeNull();
  expect(ctx.view.getByRole("button", { name: "10 newer, Show 10 more" })).toBeTruthy();
});

/** The baby page at `entry`, routed as the app routes it, with the overlays a visitor can open. */
async function renderBabyPageWithPreloads(harness: ConvexTestHarness, entry: string) {
  return await renderMountedFileRouteWithPreloads({
    childRoutes: [
      { path: "share", route: shareRouteModule.Route },
      { path: "login", route: loginRouteModule.Route },
    ],
    harness,
    initialEntry: entry,
    overlayHistory: null,
    path: "/baby/$publicId",
    route: routeModule.Route,
    wrap: null,
  });
}

test("a removed item's notice can preload its dismiss link and leave the feed as it is", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  const itemId = seeded.itemId("Message 10");
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(itemId, { deletedAt: Date.now() });
  });
  await using _inView = everythingInViewResource();
  await using ctx = await renderBabyPageWithPreloads(
    harness,
    `/baby/${seeded.publicId}?item=${itemId}`,
  );
  await ctx.view.findByText("That update or message isn't here any more.");
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
  await harness.refresh();

  // Still the removed item's place, with the notice.
  expect(ctx.view.getByText("That update or message isn't here any more.")).toBeTruthy();
  expect(ctx.view.getByText("Message 12")).toBeTruthy();
  expect(ctx.view.queryByText("Message 13")).toBeNull();
});

test("opening an overlay over a linked feed keeps the feed under it", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  const itemId = seeded.itemId("Message 10");
  await using ctx = await renderBabyPageWithPreloads(
    harness,
    `/baby/${seeded.publicId}?item=${itemId}`,
  );
  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 10"));
  });

  fireEvent.click(ctx.view.getByLabelText("Share the link"));
  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe(`/baby/${seeded.publicId}/share`);
  });
  await harness.refresh();

  expect(ctx.router.state.location.search).toEqual({ item: itemId });
  expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 10"));
  expect(ctx.view.getByText("Message 12")).toBeTruthy();
  expect(ctx.view.queryByText("Message 13")).toBeNull();
});

test("closing an overlay the page was opened at goes back to the linked feed", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  const itemId = seeded.itemId("Message 10");
  // No overlay history to go back to: closing navigates to the page.
  await using ctx = await renderBabyPageWithPreloads(
    harness,
    `/baby/${seeded.publicId}/share?item=${itemId}`,
  );
  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  fireEvent.keyDown(ctx.view.getByRole("dialog"), { key: "Escape" });

  await vi.waitFor(() => {
    expect(ctx.router.state.location.pathname).toBe(`/baby/${seeded.publicId}`);
  });
  expect(ctx.router.state.location.search).toEqual({ item: itemId });
  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 10"));
  });
});

test("Jump to latest leaves the linked feed for the latest one", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  const itemId = seeded.itemId("Message 10");
  await using ctx = await renderBabyPageWithPreloads(
    harness,
    `/baby/${seeded.publicId}?item=${itemId}`,
  );

  fireEvent.click(await ctx.view.findByRole("link", { name: "Jump to latest" }));

  await vi.waitFor(() => {
    expect(ctx.router.state.location.search).toEqual({});
  });
  await ctx.view.findByText(`Message ${TIMELINE_PAGE_SIZE + 2}`);
  expect(highlightedRow(ctx.view)).toBeNull();
});

test("dismissing a removed item's notice leaves for the latest feed", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  const itemId = seeded.itemId("Message 10");
  await harness.t.run(async (ctx) => {
    await ctx.db.patch(itemId, { deletedAt: Date.now() });
  });
  await using ctx = await renderBabyPageWithPreloads(
    harness,
    `/baby/${seeded.publicId}?item=${itemId}`,
  );

  fireEvent.click(await ctx.view.findByRole("link", { name: "Dismiss notice" }));

  await vi.waitFor(() => {
    expect(ctx.router.state.location.search).toEqual({});
  });
  await ctx.view.findByText(`Message ${TIMELINE_PAGE_SIZE + 2}`);
  expect(ctx.view.queryByText("That update or message isn't here any more.")).toBeNull();
});

test("navigating to an item the feed hasn't loaded opens the feed at it", async () => {
  await using harness = await createConvexTestHarness({ identity: { subject: "alice" } });
  const seeded = await seedFeedMessages(harness, { count: TIMELINE_PAGE_SIZE + 2 });
  await using ctx = await renderBabyPage(harness, `/baby/${seeded.publicId}`);
  await ctx.view.findByText(`Message ${TIMELINE_PAGE_SIZE + 2}`);
  expect(ctx.view.queryByText("Message 1")).toBeNull();
  const itemId = seeded.itemId("Message 1");

  await ctx.router.navigate({
    hash: `item-${itemId}`,
    params: { publicId: seeded.publicId },
    search: { item: itemId },
    to: "/baby/$publicId",
  });

  await vi.waitFor(() => {
    expect(highlightedRow(ctx.view)).toBe(messageRow(ctx.view, "Message 1"));
  });
  expect(ctx.view.getByRole("button", { name: "19 newer, Show 19 more" })).toBeTruthy();
  expect(ctx.view.getByText("Message 3")).toBeTruthy();
  expect(ctx.view.queryByText("Message 4")).toBeNull();
  expect(ctx.view.queryByText(`Message ${TIMELINE_PAGE_SIZE + 2}`)).toBeNull();
});
