import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { TimelineFeed, UpdateComposer } from "@/components/baby/timeline";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { BabyData } from "@baby-outlet/backend/src/types";
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import { LocaleProvider } from "@/lib/i18n";
import { testPreloadedConvexInfiniteQuery } from "@workspace/convex-prefetch/test-helpers";
import type { PreloadedConvexInfiniteQuery } from "@workspace/convex-prefetch";
import type { FunctionReturnType } from "convex/server";

// Observe what the composer submits: every useMutation hook in the component
// returns this mock (only updates.post is actually invoked in these tests)
const mocks = vi.hoisted(() => ({
  mutate: vi.fn<(args: unknown) => Promise<unknown>>(),
}));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useMutation: () => mocks.mutate,
}));

// Replace the live Convex page fetch/watch with pure TanStack reads over the
// handle's initialData (no registered Convex client in these tests).
vi.mock("@workspace/convex-prefetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/convex-prefetch")>();
  const { useSuspenseInfiniteQuery } = await import("@tanstack/react-query");
  return {
    ...actual,
    usePreloadedConvexInfiniteQuery: (
      funcRef: unknown,
      opts: {
        handle: PreloadedConvexInfiniteQuery<never>;
        remixArgs: ((args: Record<string, unknown>) => Record<string, unknown>) | null;
      },
    ) => {
      const input = opts.handle.input as Record<string, unknown>;
      const args = opts.remixArgs ? opts.remixArgs(input) : input;
      return useSuspenseInfiniteQuery({
        queryKey: ["test-infinite", funcRef, args],
        queryFn: async () => {
          throw new Error("not fetched in tests");
        },
        initialPageParam: { numItems: opts.handle.numItems, cursor: null },
        getNextPageParam: () => undefined,
        initialData: opts.handle.initialData,
        staleTime: Infinity,
      } as never);
    },
  };
});

{
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

const notYetBaby: BabyData = {
  name: "Baby Smith",
  dueDate: "2026-09-01",
  dueDateDisplayMode: "exact",
  publicDueDateText: null,
  laborStarted: null,
  wentToHospital: null,
  babyBorn: null,
};

const laborStartedBaby: BabyData = {
  ...notYetBaby,
  laborStarted: "2026-08-20T08:00:00.000Z",
};

// The mutations are never invoked in these tests; the client only needs to
// exist for the `useMutation` hooks to mount.
const babyId = "fake-baby-id" as Id<"baby">;

type TimelinePage = FunctionReturnType<typeof api.timeline.listByBaby>;

function timelineHandle(page: TimelinePage) {
  return testPreloadedConvexInfiniteQuery<typeof api.timeline.listByBaby>({
    input: { babyId },
    numItems: 20,
    initialData: {
      pages: [page],
      pageParams: [{ numItems: 20, cursor: null }],
    },
  });
}

type ComposerResourceValue = {
  view: ReturnType<typeof render>;
  setBaby: (currentBaby: BabyData) => void;
};

function renderComposerResource(baby: BabyData, locale: SupportedLocale = "en-GB") {
  const client = new ConvexReactClient("https://example.convex.cloud", {
    unsavedChangesWarning: false,
  });
  const withProvider = (currentBaby: BabyData): ReactElement => (
    <LocaleProvider locale={locale}>
      <ConvexProvider client={client}>
        <UpdateComposer
          babyId={babyId}
          baby={currentBaby}
          babyName={currentBaby.name}
          onPosted={() => {}}
        />
      </ConvexProvider>
    </LocaleProvider>
  );
  const view = render(withProvider(baby));
  const value: ComposerResourceValue = {
    view,
    setBaby: (currentBaby) => view.rerender(withProvider(currentBaby)),
  };
  return makeResource(value, async () => {
    view.unmount();
    await client.close();
  });
}

test("the status radio group is labelled and offers only future stages", async () => {
  await using composer = renderComposerResource(notYetBaby);
  const view = composer.view;

  const group = view.getByRole("radiogroup", { name: "Status change (optional)" });
  expect(group).toBeTruthy();

  expect(view.getByRole("radio", { name: "No status change" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(view.getByRole("radio", { name: "Labour started" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Gone to hospital" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Baby born" })).toBeTruthy();

  // Once labour has started, that stage is no longer offered
  composer.setBaby(laborStartedBaby);
  expect(view.queryByRole("radio", { name: "Labour started" })).toBeNull();
  expect(view.getByRole("radio", { name: "Gone to hospital" })).toBeTruthy();
});

test("the milestone metadata resolves through the Swedish catalog", async () => {
  await using composer = renderComposerResource(notYetBaby, "sv");
  const view = composer.view;

  expect(view.getByRole("radiogroup", { name: "Statusändring (valfritt)" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Ingen statusändring" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Förlossningen är igång" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Åkt in till förlossningen" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Bäbisen är född" })).toBeTruthy();
});

test("the composer only offers visible future milestones", async () => {
  await using composer = renderComposerResource({
    ...notYetBaby,
    milestoneVisibility: { showLabor: false, showHospital: true },
    laborStarted: "2026-08-20T08:00:00.000Z",
  });
  const view = composer.view;

  expect(view.queryByRole("radio", { name: "Labour started" })).toBeNull();
  expect(view.getByRole("radio", { name: "Gone to hospital" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Baby born" })).toBeTruthy();
});

test("a stale milestone selection is cleared when the status advances elsewhere", async () => {
  await using composer = renderComposerResource(notYetBaby);
  const view = composer.view;

  fireEvent.click(view.getByRole("radio", { name: "Labour started" }));
  expect(view.getByRole("radio", { name: "Labour started" }).getAttribute("aria-checked")).toBe(
    "true",
  );

  // The status advances from another tab: the stale choice is dropped
  composer.setBaby(laborStartedBaby);
  expect(view.getByRole("radio", { name: "No status change" }).getAttribute("aria-checked")).toBe(
    "true",
  );

  // ...and it must not resurface if the milestone is unmarked again later
  composer.setBaby(notYetBaby);
  expect(view.getByRole("radio", { name: "Labour started" }).getAttribute("aria-checked")).toBe(
    "false",
  );
  expect(view.getByRole("radio", { name: "No status change" }).getAttribute("aria-checked")).toBe(
    "true",
  );
});

test("an empty event-time picker does not post occurredAt", async () => {
  mocks.mutate.mockReset().mockResolvedValue("update-id");
  await using composer = renderComposerResource(notYetBaby);
  const view = composer.view;

  fireEvent.click(view.getByRole("radio", { name: "Labour started" }));
  // The picker appears empty (= now) — leave it blank
  const picker = view.getByLabelText(/when did it happen/i) as HTMLInputElement;
  expect(picker.value).toBe("");
  fireEvent.click(view.getByRole("button", { name: /post and mark/i }));

  await vi.waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
  expect(mocks.mutate.mock.calls[0]?.[0]).toMatchObject({
    babyId,
    milestone: "labor_started",
    occurredAt: undefined,
  });
});

test("a filled event-time picker posts the backdated occurredAt", async () => {
  mocks.mutate.mockReset().mockResolvedValue("update-id");
  await using composer = renderComposerResource(notYetBaby);
  const view = composer.view;

  fireEvent.click(view.getByRole("radio", { name: "Labour started" }));
  const backdated = "2026-08-10T08:30";
  fireEvent.change(view.getByLabelText(/when did it happen/i), {
    target: { value: backdated },
  });
  fireEvent.click(view.getByRole("button", { name: /post and mark/i }));

  await vi.waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
  expect(mocks.mutate.mock.calls[0]?.[0]).toMatchObject({
    babyId,
    milestone: "labor_started",
    occurredAt: new Date(backdated).getTime(),
  });
});

test("the composer previews a selected photo and can remove it", async () => {
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  await using _objectUrls = makeResource({}, () => {
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
  await using composer = renderComposerResource(notYetBaby);
  const view = composer.view;

  const fileInput = view.container.querySelector('input[type="file"]');
  if (!fileInput) throw new Error("hidden file input missing");

  fireEvent.change(fileInput, {
    target: { files: [new File(["png"], "baby.png", { type: "image/png" })] },
  });
  expect(view.getByAltText("Photo to post")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Remove photo" }));
  expect(view.queryByAltText("Photo to post")).toBeNull();
});

function renderFeed(opts: { baby: BabyData; isOwner: boolean; page: TimelinePage }) {
  const client = new ConvexReactClient("https://example.convex.cloud", {
    unsavedChangesWarning: false,
  });
  const handle = timelineHandle(opts.page);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider locale="en-GB">
        <ConvexProvider client={client}>
          <TooltipProvider>
            <TimelineFeed
              babyId={babyId}
              baby={opts.baby}
              babyName={opts.baby.name}
              isOwner={opts.isOwner}
              timeline={handle}
            />
          </TooltipProvider>
        </ConvexProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return makeResource(rendered, async () => {
    rendered.unmount();
    await client.close();
    queryClient.clear();
  });
}

test("timeline milestone deletion is disabled while a later status exists", async () => {
  const bornBaby: BabyData = {
    ...laborStartedBaby,
    wentToHospital: "2026-08-20T12:00:00.000Z",
    babyBorn: "2026-08-21T03:00:00.000Z",
  };
  await using view = renderFeed({
    baby: bornBaby,
    isOwner: true,
    page: {
      page: [
        {
          _id: "timeline-item-id" as Id<"timelineItems">,
          kind: "update",
          postedAt: Date.now(),
          update: {
            _id: "update-id" as Id<"updates">,
            message: null,
            milestone: "gone_to_hospital",
            occurredAt: Date.now(),
            photoUrl: null,
            thumbnailUrl: null,
            blurDataUrl: null,
            isCurrentPagePhoto: false,
          },
        },
      ],
      isDone: true,
      continueCursor: "",
    },
  });

  const deleteButton = view.getByRole("button", { name: "Delete update" }) as HTMLButtonElement;
  expect(deleteButton.disabled).toBe(true);
  const tooltipTrigger = deleteButton.closest('[data-slot="tooltip-trigger"]');
  if (!tooltipTrigger) throw new Error("Tooltip trigger missing");
  expect(tooltipTrigger.getAttribute("aria-label")).toBe("Delete the Born status first");
  expect(view.queryByRole("alertdialog")).toBeNull();
});

test("shows the prefetched first page instead of a spinner while the live query loads", async () => {
  await using view = renderFeed({
    baby: notYetBaby,
    isOwner: false,
    page: {
      page: [
        {
          _id: "timeline-item-id" as Id<"timelineItems">,
          kind: "encouragement",
          postedAt: Date.now(),
          encouragement: {
            _id: "encouragement-id" as Id<"encouragements">,
            authorName: "Grandma",
            message: "Can't wait to meet you!",
            createdAt: Date.now(),
            isMine: false,
          },
        },
      ],
      isDone: false,
      continueCursor: "cursor",
    },
  });

  expect(view.queryByText("Loading the timeline...")).toBeNull();
  expect(view.getByText("Grandma")).toBeTruthy();
  expect(view.getByText("Can't wait to meet you!")).toBeTruthy();
});

test("shows the empty feed, not a spinner, when the prefetched first page is empty", async () => {
  await using view = renderFeed({
    baby: notYetBaby,
    isOwner: false,
    page: { page: [], isDone: true, continueCursor: "" },
  });

  expect(view.queryByText("Loading the timeline...")).toBeNull();
  expect(view.getByText("Nothing here yet")).toBeTruthy();
});

test("renders historical milestone badges regardless of current selection", async () => {
  await using view = renderFeed({
    baby: {
      ...notYetBaby,
      milestoneVisibility: { showLabor: false, showHospital: true },
      laborStarted: "2026-08-20T08:00:00.000Z",
    },
    isOwner: false,
    page: {
      page: [
        {
          _id: "timeline-item-id" as Id<"timelineItems">,
          kind: "update",
          postedAt: Date.now(),
          update: {
            _id: "update-id" as Id<"updates">,
            message: "A family update",
            milestone: "labor_started",
            occurredAt: Date.now(),
            photoUrl: null,
            thumbnailUrl: null,
            blurDataUrl: null,
            isCurrentPagePhoto: false,
          },
        },
      ],
      isDone: true,
      continueCursor: "",
    },
  });

  expect(view.getByText("A family update")).toBeTruthy();
  expect(view.getByText("Labour started")).toBeTruthy();
});
