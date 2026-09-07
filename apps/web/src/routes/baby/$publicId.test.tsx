import { QueryClient } from "@tanstack/react-query";
import { getConvexQueryPreloader } from "@workspace/convex-prefetch";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { expect, test, vi } from "vitest";
import { StatusDisplay } from "@/components/baby/status-display";
import { api } from "@workspace/convex/convex/_generated/api";
import type { Id } from "@workspace/convex/convex/_generated/dataModel";
import schema from "@workspace/convex/convex/schema";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { createBabyArgs, modules, registerComponents } from "@workspace/convex/convex/test.setup";
import type { BabyData } from "@workspace/convex/src/types";
import {
  FORBIDDEN,
  DEFAULT_MILESTONE_VISIBILITY,
  getCurrentStatus,
} from "@workspace/convex/src/types";
import { LocaleProvider } from "@/lib/i18n";
import { browserPushQueryOptions } from "@/components/baby/notification-subscribe";
import { getBabySeo } from "@/lib/seo";
import { renderResource } from "@/test/renderResource";
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

  await using view = renderResource(<BabyDetailPage baby={baby} />);

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

  await using view = renderResource(<BabyDetailPage baby={baby} />);
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

  await using view = renderResource(<BabyDetailPage baby={baby} />);
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

  await using view = renderResource(
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

  await using view = renderResource(
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

import type { JsonValue } from "@workspace/runtime/json";
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

function makeLoaderQueryClient(handlers: QueryHandlers) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: (ctx) => {
          const name = String(ctx.queryKey[1]);
          if (name in handlers) {
            return Promise.resolve(handlers[name]);
          }
          return Promise.resolve(null);
        },
        retry: false,
      },
    },
  });
}

type LoaderOptions = {
  convexClient:
    | {
        mutation: ReturnType<typeof vi.fn>;
        setAuth: ReturnType<typeof vi.fn>;
      }
    | undefined;
  isAuthenticated: boolean | undefined;
  locale: string | undefined;
  token: string | null | undefined;
};

async function setupBabyLoader(
  handlers: QueryHandlers,
  options: LoaderOptions | undefined = undefined,
) {
  const setAuth = options?.convexClient?.setAuth ?? vi.fn();
  const mutation =
    options?.convexClient?.mutation ??
    vi.fn<() => Promise<{ locale: string }>>(() => Promise.resolve({ locale: "en-GB" }));
  // The infinite timeline query fetches through the registered Convex client.
  const { registerConvexInfiniteQueryClient } = await import("@workspace/convex-prefetch");
  registerConvexInfiniteQueryClient({
    // @ts-expect-error — fixture only implements query
    convexClient: { query: () => Promise.resolve(EMPTY_PAGE) },
    serverHttpClient: undefined,
  });
  // @ts-expect-error — stub context is the subset the loader reads
  const loader: (opts: {
    context: {
      convexClient: { mutation: typeof mutation; setAuth: typeof setAuth };
      convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
      isAuthenticated: boolean;
      locale: string;
      queryClient: QueryClient;
      token: string | null;
    };
    params: { publicId: string };
  }) => Promise<BabyLoaderResult> = routeModule.Route.options.loader;
  const queryClient = makeLoaderQueryClient(handlers);
  const result = await loader({
    context: {
      convexClient: { mutation, setAuth },
      convexPreloader: getConvexQueryPreloader(queryClient),
      isAuthenticated: options?.isAuthenticated ?? false,
      locale: options?.locale ?? "en-GB",
      queryClient,
      token: options?.token ?? null,
    },
    params: { publicId: "baby-smith" },
  });
  return { queryClient, result };
}

async function runBabyLoader(
  handlers: QueryHandlers,
  options: LoaderOptions | undefined = undefined,
) {
  const setup = await setupBabyLoader(handlers, options);
  return setup.result;
}

test("loader queries the same set for visitors; gated queries come back forbidden", async () => {
  const result = await runBabyLoader({
    "baby:getByPublicId": BABY_DOC,
    "baby:getManagerBaby": "forbidden",
    "baby:getScheduledNotifications": "forbidden",
    "coParents:myAccess": { canManage: false, isOwner: false },
    "pushSubscriptions:getSubscriptionCount": "forbidden",
    "timeline:listByBaby": EMPTY_PAGE,
  });

  expect(result.baby).toMatchObject({ initialData: BABY_DOC });
  expect(result.myAccess).toMatchObject({ initialData: { canManage: false } });
  expect(result.managerBaby).toMatchObject({ initialData: "forbidden" });
  expect(result.timeline).toMatchObject({ input: { babyId: "baby-smith" }, numItems: 20 });
  expect(result.scheduledNotifications).toMatchObject({ initialData: "forbidden" });
  expect(result.subscriptionCount).toMatchObject({ initialData: "forbidden" });
});

test("loader gives managers the same handles with real data", async () => {
  const result = await runBabyLoader({
    "baby:getByPublicId": BABY_DOC,
    "baby:getManagerBaby": { ...BABY_DOC, birthJourney: "labor" },
    "baby:getScheduledNotifications": [],
    "coParents:myAccess": { canManage: true, isOwner: true },
    "pushSubscriptions:getSubscriptionCount": 2,
    "timeline:listByBaby": EMPTY_PAGE,
  });

  expect(result.scheduledNotifications).toMatchObject({
    initialData: [],
    input: { babyId: "baby-smith" },
  });
  expect(result.subscriptionCount).toMatchObject({
    initialData: 2,
    input: { babyId: "baby-smith" },
  });
  expect(result.onboarding).toMatchObject({ input: {} });
  expect(result.managerBaby).toMatchObject({
    initialData: { birthJourney: "labor" },
  });
});

test("beforeLoad 404s unknown babies", async () => {
  // @ts-expect-error — stub opts are the fields beforeLoad reads
  const beforeLoad: (opts: {
    context: {
      convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
      queryClient: QueryClient;
    };
    location: { href: string };
    params: { publicId: string };
  }) => Promise<object | void | null> = routeModule.Route.options.beforeLoad;

  const queryClient = makeLoaderQueryClient({ "baby:getByPublicId": null });
  const pending = beforeLoad({
    context: {
      convexPreloader: getConvexQueryPreloader(queryClient),
      queryClient,
    },
    location: { href: "/baby/baby-smith" },
    params: { publicId: "baby-smith" },
  });

  await expect(pending).rejects.toMatchObject({ isNotFound: true });
});

test("beforeLoad uses the baby's resolved locale", async () => {
  // @ts-expect-error — stub opts are the fields beforeLoad reads
  const beforeLoad: (opts: {
    context: {
      convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
      queryClient: QueryClient;
    };
    location: { href: string };
    params: { publicId: string };
  }) => Promise<object | void | null> = routeModule.Route.options.beforeLoad;
  const queryClient = makeLoaderQueryClient({
    "baby:getByPublicId": { ...BABY_DOC, publicId: "test-baby-4", resolvedLocale: "sv" },
  });

  await expect(
    beforeLoad({
      context: {
        convexPreloader: getConvexQueryPreloader(queryClient),
        queryClient,
      },
      location: { href: "/baby/test-baby-4" },
      params: { publicId: "test-baby-4" },
    }),
  ).resolves.toEqual({ locale: "sv" });
});

test("beforeLoad rewrites a stale public id and keeps the subpath", async () => {
  // @ts-expect-error — stub opts are the fields beforeLoad reads
  const beforeLoad: (opts: {
    context: {
      convexPreloader: ReturnType<typeof getConvexQueryPreloader>;
      queryClient: QueryClient;
    };
    location: { href: string };
    params: { publicId: string };
  }) => Promise<object | void | null> = routeModule.Route.options.beforeLoad;
  const queryClient = makeLoaderQueryClient({ "baby:getByPublicId": BABY_DOC });

  await expect(
    beforeLoad({
      context: {
        convexPreloader: getConvexQueryPreloader(queryClient),
        queryClient,
      },
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

test("loader does not mutate profiles for authenticated visitors", async () => {
  const mutation = vi.fn<() => Promise<{ locale: string }>>(() =>
    Promise.resolve({ locale: "en-GB" }),
  );
  const result = await runBabyLoader(
    {
      "baby:getByPublicId": BABY_DOC,
      "baby:getManagerBaby": BABY_DOC,
      "baby:getScheduledNotifications": [],
      "coParents:myAccess": { canManage: true, isOwner: true },
      "pushSubscriptions:getSubscriptionCount": 0,
      "timeline:listByBaby": EMPTY_PAGE,
    },
    {
      convexClient: { mutation, setAuth: vi.fn() },
      isAuthenticated: true,
      locale: "en-GB",
      token: "layout-token",
    },
  );

  expect(mutation).not.toHaveBeenCalled();
  expect(result.managerBaby).toMatchObject({ initialData: BABY_DOC });
});

test("loader prefetches browser push capability on the client", async () => {
  const { queryClient, result } = await setupBabyLoader({
    "baby:getByPublicId": BABY_DOC,
    "timeline:listByBaby": EMPTY_PAGE,
  });

  expect(result.browserPush).toMatchObject({ input: "baby-smith" });
  await vi.waitFor(() => {
    expect(
      queryClient.getQueryData(browserPushQueryOptions(queryClient, "baby-smith").queryKey),
    ).toEqual({ kind: "unsupported" });
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
  harness.withIdentity(null);

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
