import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { StatusDisplay } from "@/components/baby/status-display";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import schema from "@baby-outlet/backend/convex/schema";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { modules, registerComponents } from "@baby-outlet/backend/convex/test.setup";
import type { BabyData } from "@baby-outlet/backend/src/types";
import { FORBIDDEN, getCurrentStatus } from "@baby-outlet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";

const routeModule = await import("@/routes/baby/$publicId");
const { docToBabyData, managerDocToBabyData } = routeModule;

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
        currentStatus={currentStatus}
        photoUrl={null}
        thumbnailUrl={null}
        blurDataUrl={null}
        latestUpdate={null}
      />
    </div>
  );
}

function renderResource(ui: ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("renders a baby detail page from local convex-test data", async () => {
  // Freeze "now" so StatusDisplay's until-due / overdue copy stays deterministic
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));

  const t = convexTest(schema, modules);
  await registerComponents(t);

  const asAlice = t.withIdentity({ subject: "alice" });
  const created = await asAlice.mutation(api.baby.create, {
    name: "Baby Smith",
    dueDate: "2026-09-01",
  });

  const baby = await t.query(api.baby.getByPublicId, { id: created.publicId });
  expect(baby).toMatchObject({
    name: "Baby Smith",
    publicId: "baby-smith",
    dueDate: "2026-09-01",
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
      theme: "baby-blue",
      locale: "sv",
      laborStarted: "2026-08-10T08:00:00.000Z",
      wentToHospital: "2026-08-10T12:00:00.000Z",
      babyBorn: "2026-08-11T03:00:00.000Z",
      encouragementsDisabled: true,
      photoId: "photo-id" as Id<"_storage">,
    }),
  ).toMatchObject({
    theme: "baby-blue",
    locale: "sv",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
    babyBorn: "2026-08-11T03:00:00.000Z",
    encouragementsDisabled: true,
    photoId: "photo-id",
  });
  expect(
    managerDocToBabyData({
      ...managerDoc,
      theme: "baby-blue",
      locale: "sv",
      publicDueDateText: "Retained message",
      encouragementsDisabled: true,
      photoId: "photo-id" as Id<"_storage">,
    }),
  ).toMatchObject({
    theme: "baby-blue",
    locale: "sv",
    publicDueDateText: "Retained message",
    encouragementsDisabled: true,
    photoId: "photo-id",
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
  const created = await t.withIdentity({ subject: "alice" }).mutation(api.baby.create, {
    name: "Baby Smith",
    dueDate: null,
    dueDateDisplayMode: "message",
    publicDueDateText: "Any day now",
  });
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

test("renders the public baby status in the baby's Swedish override", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-11T12:00:00.000Z"));
  const baby: BabyData = {
    name: "Nova",
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    publicDueDateText: null,
    laborStarted: null,
    wentToHospital: null,
    babyBorn: null,
  };

  await using view = renderResource(
    <LocaleProvider locale="sv">
      <StatusDisplay
        baby={baby}
        currentStatus={getCurrentStatus(baby)}
        photoUrl={null}
        thumbnailUrl={null}
        blurDataUrl={null}
        latestUpdate={null}
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
    name: "Nova",
    dueDate: "2026-09-01",
    dueDateDisplayMode: "exact",
    publicDueDateText: null,
    laborStarted: null,
    wentToHospital: null,
    babyBorn: null,
  };

  await using view = renderResource(
    <LocaleProvider locale="pt-BR">
      <StatusDisplay
        baby={baby}
        currentStatus={getCurrentStatus(baby)}
        photoUrl={null}
        thumbnailUrl={null}
        blurDataUrl={null}
        latestUpdate={null}
      />
    </LocaleProvider>,
  );

  expect(view.getByText("Ainda não")).toBeTruthy();
  expect(view.getByText("O bebê ainda está a caminho")).toBeTruthy();
  expect(view.getByText("Data prevista: 1 de setembro de 2026")).toBeTruthy();
});

// --- Route loader: awaited handles plus the owner/visitor branching ---

const BABY_DOC = { _id: "baby-1", publicId: "baby-smith", resolvedLocale: "en-GB" };
const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

function makeLoaderQueryClient(handlers: Record<string, unknown>) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: (ctx) => {
          const name = String(ctx.queryKey[1]);
          if (name in handlers) {
            return Promise.resolve(handlers[name]);
          }
          return Promise.resolve(null);
        },
      },
    },
  });
}

async function runBabyLoader(handlers: Record<string, unknown>) {
  // The infinite timeline query fetches through the registered Convex client.
  const { registerConvexInfiniteQueryClient } = await import("@workspace/convex-prefetch");
  registerConvexInfiniteQueryClient({
    convexClient: { query: () => Promise.resolve(EMPTY_PAGE) },
    serverHttpClient: undefined,
  } as never);
  const loader = routeModule.Route.options.loader as unknown as (opts: {
    context: { queryClient: QueryClient };
    params: { publicId: string };
  }) => Promise<Record<string, unknown>>;
  return await loader({
    context: { queryClient: makeLoaderQueryClient(handlers) },
    params: { publicId: "baby-smith" },
  });
}

test("loader queries the same set for visitors; gated queries come back forbidden", async () => {
  const result = await runBabyLoader({
    "baby:getByPublicId": BABY_DOC,
    "coParents:myAccess": { canManage: false, isOwner: false },
    "baby:getManagerBaby": "forbidden",
    "timeline:listByBaby": EMPTY_PAGE,
    "baby:getScheduledNotifications": "forbidden",
    "pushSubscriptions:getSubscriptionCount": "forbidden",
    "coParents:listForBaby": "forbidden",
  });

  expect(result.baby).toMatchObject({ initialData: BABY_DOC });
  expect(result.myAccess).toMatchObject({ initialData: { canManage: false } });
  expect(result.managerBaby).toMatchObject({ initialData: "forbidden" });
  expect(result.timeline).toMatchObject({ input: { babyId: "baby-1" }, numItems: 20 });
  expect(result.scheduledNotifications).toMatchObject({ initialData: "forbidden" });
  expect(result.subscriptionCount).toMatchObject({ initialData: "forbidden" });
  expect(result.coParentsList).toMatchObject({ initialData: "forbidden" });
});

test("loader gives managers the same handles with real data", async () => {
  const result = await runBabyLoader({
    "baby:getByPublicId": BABY_DOC,
    "coParents:myAccess": { canManage: true, isOwner: true },
    "baby:getManagerBaby": { ...BABY_DOC, birthJourney: "labor" },
    "timeline:listByBaby": EMPTY_PAGE,
    "baby:getScheduledNotifications": [],
    "pushSubscriptions:getSubscriptionCount": 2,
    "coParents:listForBaby": { coParents: [], invites: [] },
  });

  expect(result.scheduledNotifications).toMatchObject({
    input: { babyId: "baby-1" },
    initialData: [],
  });
  expect(result.subscriptionCount).toMatchObject({
    input: { babyId: "baby-1" },
    initialData: 2,
  });
  expect(result.onboarding).toMatchObject({ input: {} });
  expect(result.managerBaby).toMatchObject({
    initialData: { birthJourney: "labor" },
  });
  expect(result.coParentsList).toMatchObject({
    input: { babyId: "baby-1" },
    initialData: { coParents: [], invites: [] },
  });
});

test("loader 404s unknown babies", async () => {
  const pending = runBabyLoader({ "baby:getByPublicId": null });

  await expect(pending).rejects.toMatchObject({ isNotFound: true });
});
