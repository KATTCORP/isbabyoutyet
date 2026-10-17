import type { QueryClient } from "@raf-query/react";
import type { ConvexReader } from "@workspace/convex-query";
import type { JsonValue } from "@workspace/runtime/json";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
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
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { seedOwnedBaby } from "@/test/convexTestSeed";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";

const routeModule = await import("@/routes/baby/$publicId/route");
const { docToBabyData, managerDocToBabyData } = routeModule;

test("parent route caches public overlays and keeps manager overlays private", () => {
  // @ts-expect-error — stub opts are the fields headers reads
  const headers: (opts: {
    matches: Array<{ routeId: string }>;
    params: { publicId: string };
  }) => Record<string, string> = routeModule.Route.options.headers;
  const publicHeaders = headers({
    matches: [{ routeId: "/baby/$publicId" }, { routeId: "/baby/$publicId/share" }],
    params: { publicId: "juniper-hale" },
  });
  const privateHeaders = headers({
    matches: [{ routeId: "/baby/$publicId" }, { routeId: "/baby/$publicId/_auth/settings" }],
    params: { publicId: "juniper-hale" },
  });
  const loginHeaders = headers({
    matches: [{ routeId: "/baby/$publicId" }, { routeId: "/baby/$publicId/login" }],
    params: { publicId: "juniper-hale" },
  });
  const signupHeaders = headers({
    matches: [{ routeId: "/baby/$publicId" }, { routeId: "/baby/$publicId/signup" }],
    params: { publicId: "juniper-hale" },
  });

  expect(publicHeaders["Cache-Control"]).toContain("public");
  expect(publicHeaders["Vercel-Cache-Tag"]).toContain("baby-public-id:juniper-hale");
  expect(privateHeaders["Cache-Control"]).toContain("private");
  expect(privateHeaders["Cache-Control"]).toContain("no-store");
  expect(loginHeaders["Cache-Control"]).toContain("private");
  expect(loginHeaders["Cache-Control"]).toContain("no-store");
  expect(signupHeaders["Cache-Control"]).toContain("private");
  expect(signupHeaders["Cache-Control"]).toContain("no-store");
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

const BABY_DOC = { _id: "baby-1", publicId: "baby-smith", resolvedLocale: "en-GB" };
const EMPTY_PAGE = { continueCursor: "", isDone: true, page: [] };

type QueryHandlers = Record<string, JsonValue>;
type BabyLoaderResult = {
  baby: unknown;
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
type RouteContextStub = { context: { queryClient: QueryClient<ConvexReader> } };

function loaderQueryClientResource(handlers: QueryHandlers) {
  return stubQueryClientResource((query) => {
    const name = getFunctionName(query);
    return Promise.resolve(name in handlers ? handlers[name] : null);
  });
}

// @ts-expect-error — stub opts are the fields the loader reads
const loader: (
  opts: RouteContextStub & { params: { publicId: string } },
) => Promise<BabyLoaderResult> = routeModule.Route.options.loader;

// @ts-expect-error — stub opts are the fields beforeLoad reads
const beforeLoad: (
  opts: RouteContextStub & { location: { href: string }; params: { publicId: string } },
) => Promise<object | void | null> = routeModule.Route.options.beforeLoad;

async function runBabyLoader(queryClient: QueryClient<ConvexReader>) {
  // As `beforeLoad` does before every loader run.
  await queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: "baby-smith" });
  return await loader({ context: { queryClient }, params: { publicId: "baby-smith" } });
}

test("loader ensures the same set for visitors; gated queries come back forbidden", async () => {
  // Workers share jsdom storage across files; this visitor has never posted.
  localStorage.removeItem("encouragement-visitor-id");
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": BABY_DOC,
    "baby:getManagerBaby": "forbidden",
    "baby:getScheduledNotifications": "forbidden",
    "coParents:myAccess": { canManage: false, isOwner: false },
    "pushSubscriptions:getSubscriptionCount": "forbidden",
    "timeline:listByBaby": EMPTY_PAGE,
  });
  const queryClient = stub.queryClient;
  const result = await runBabyLoader(queryClient);

  expect(result.baby).toMatchObject({ data: expect.anything(), input: { id: "baby-smith" } });
  expect(result.timeline).toMatchObject({
    data: expect.anything(),
    input: { args: { babyId: "baby-smith" }, numItems: 20 },
  });
  expect(queryClient.getData(convexQuery(api.baby.getByPublicId), { id: "baby-smith" })).toEqual(
    BABY_DOC,
  );
  expect(
    queryClient.getData(convexQuery(api.coParents.myAccess), { babyId: "baby-smith" }),
  ).toMatchObject({
    canManage: false,
  });
  expect(queryClient.getData(convexQuery(api.baby.getManagerBaby), { babyId: "baby-smith" })).toBe(
    "forbidden",
  );
  expect(
    queryClient.getData(convexQuery(api.baby.getScheduledNotifications), { babyId: "baby-smith" }),
  ).toBe("forbidden");
  expect(
    queryClient.getData(convexQuery(api.pushSubscriptions.getSubscriptionCount), {
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
    "timeline:listByBaby": EMPTY_PAGE,
  });
  const queryClient = stub.queryClient;
  const result = await runBabyLoader(queryClient);

  expect(result.scheduledNotifications).toMatchObject({ input: { babyId: "baby-smith" } });
  expect(result.subscriptionCount).toMatchObject({ input: { babyId: "baby-smith" } });
  expect(result.onboarding).toMatchObject({ data: null, input: {} });
  expect(
    queryClient.getData(convexQuery(api.baby.getScheduledNotifications), { babyId: "baby-smith" }),
  ).toEqual([]);
  expect(
    queryClient.getData(convexQuery(api.pushSubscriptions.getSubscriptionCount), {
      babyId: "baby-smith",
    }),
  ).toBe(2);
  expect(
    queryClient.getData(convexQuery(api.baby.getManagerBaby), { babyId: "baby-smith" }),
  ).toMatchObject({
    birthJourney: "labor",
  });
});

test("beforeLoad 404s unknown babies", async () => {
  await using stub = loaderQueryClientResource({ "baby:getByPublicId": null });
  const pending = beforeLoad({
    context: { queryClient: stub.queryClient },
    location: { href: "/baby/baby-smith" },
    params: { publicId: "baby-smith" },
  });

  await expect(pending).rejects.toMatchObject({ isNotFound: true });
});

test("beforeLoad uses the baby's resolved locale", async () => {
  await using stub = loaderQueryClientResource({
    "baby:getByPublicId": { ...BABY_DOC, publicId: "test-baby-4", resolvedLocale: "sv" },
  });

  await expect(
    beforeLoad({
      context: { queryClient: stub.queryClient },
      location: { href: "/baby/test-baby-4" },
      params: { publicId: "test-baby-4" },
    }),
  ).resolves.toEqual({ locale: "sv" });
});

test("beforeLoad rewrites a stale public id and keeps the subpath", async () => {
  await using stub = loaderQueryClientResource({ "baby:getByPublicId": BABY_DOC });

  await expect(
    beforeLoad({
      context: { queryClient: stub.queryClient },
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
    "timeline:listByBaby": EMPTY_PAGE,
  });
  const queryClient = stub.queryClient;
  const result = await runBabyLoader(queryClient);

  expect(result.browserPush).toMatchObject({ input: "baby-smith" });
  await vi.waitFor(() => {
    expect(queryClient.getData(browserPushCapabilityQuery, "baby-smith")).toEqual({
      kind: "unsupported",
    });
  });
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
      name: "Juniper Hale",
      ogImageHash: "testhash",
      photoUrl: null,
      publicDueDateText: undefined,
      publicId: "juniper-hale-1",
      resolvedLocale: "en-GB",
      theme: "baby-blue",
      thumbnailUrl: null,
      timeZone: "Europe/London",
      wentToHospital: null,
    },
    "juniper-hale",
  );

  expect(new URL(seo.imageUrl).pathname).toBe("/og/baby/juniper-hale-testhash-20260811");
  expect(seo.canonical).toBe("https://isbabyoutyet.com/baby/juniper-hale");
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
