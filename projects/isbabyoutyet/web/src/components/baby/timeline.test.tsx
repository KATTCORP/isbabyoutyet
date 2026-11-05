import { fireEvent, render, within } from "@testing-library/react";
import { QueryClientProvider } from "@raf-query/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ConvexProvider } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { babyFeedItemUrl } from "@isbabyoutyet/backend/src/babyFeedUrl";
import type { BabyData } from "@isbabyoutyet/backend/src/types";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import { isPlainObject } from "@workspace/runtime/guards";
import { LocaleProvider } from "@/lib/i18n";
import { visitorTagQuery } from "@/lib/visitor-tag";
import { loadTimelineFeed } from "@/lib/timeline-feed";
import { TimelineFeed, TimelineFeedView, UpdateComposer } from "@/components/baby/timeline";
import { EncouragementForm } from "@/components/baby/encouragements";
import { createConvexTestHarness, type ConvexTestHarness } from "@/test/convexTestHarness";
import {
  seedOwnedBaby,
  seedTimelineEncouragement,
  seedTimelineUpdateWithPhoto,
  settleScheduledFunctions,
  signUpTestUser,
  storeTestBlob,
  postTestUpdate,
} from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { htmlButton, htmlInput, htmlTextArea, htmlImage, htmlElement } from "@/test/htmlElement";

function isMutationArgsRecord<TArgs>(args: TArgs): args is TArgs & object {
  return isPlainObject(args);
}

const notYetBaby: BabyData = {
  babyBorn: null,
  dueDate: "2026-09-01",
  dueDateDisplayMode: "exact",
  laborStarted: null,
  name: "Baby Smith",
  publicDueDateText: null,
  timeZone: "Europe/London",
  wentToHospital: null,
};

const laborStartedBaby: BabyData = {
  ...notYetBaby,
  laborStarted: "2026-08-20T08:00:00.000Z",
};

const VISITOR_ID_STORAGE_KEY = "encouragement-visitor-id";

async function seedOwnerBaby(harness: ConvexTestHarness) {
  const ownerId = await signUpTestUser(harness, {
    email: "owner@example.com",
    name: "Owner",
    password: "password123",
  });
  await harness.withIdentity({ subject: ownerId });
  return await seedOwnedBaby(harness, { dueDate: "2026-09-01", name: "Baby Smith" });
}

function renderComposerTree(
  harness: ConvexTestHarness,
  opts: {
    baby: BabyData;
    babyId: Id<"baby">;
    locale: SupportedLocale;
  },
) {
  return (
    <QueryClientProvider client={harness.queryClient}>
      <ConvexProvider
        // @ts-expect-error — integration client is not ConvexReactClient
        client={harness.convexClient}
      >
        <LocaleProvider locale={opts.locale}>
          <UpdateComposer
            baby={opts.baby}
            babyId={opts.babyId}
            babyName={opts.baby.name}
            onPosted={() => {}}
            subscriptionCount={0}
          />
        </LocaleProvider>
      </ConvexProvider>
    </QueryClientProvider>
  );
}

async function renderComposer(
  harness: ConvexTestHarness,
  opts: {
    baby: BabyData;
    babyId: Id<"baby">;
    locale: SupportedLocale | undefined;
  },
) {
  let baby: BabyData = opts.baby;
  const locale = opts.locale ?? "en-GB";
  const view = render(renderComposerTree(harness, { baby, babyId: opts.babyId, locale }));
  const controls = {
    setBaby(nextBaby: BabyData) {
      baby = nextBaby;
      view.rerender(renderComposerTree(harness, { baby, babyId: opts.babyId, locale }));
    },
    view,
  };
  return makeResource(controls, () => {
    view.unmount();
  });
}

type RenderTimelineFeedOpts = {
  baby: BabyData;
  babyId: Id<"baby">;
  isOwner: boolean;
  publicId: string;
  visitorId: string | undefined;
};

async function renderTimelineFeed(harness: ConvexTestHarness, opts: RenderTimelineFeedOpts) {
  return await renderTimelineFeedFrom(harness, { ...opts, item: null });
}

/** Renders the feed the way the baby route does for `?item=` (or none). */
async function renderTimelineFeedFrom(
  harness: ConvexTestHarness,
  opts: RenderTimelineFeedOpts & { item: string | null },
) {
  if (opts.visitorId) {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, opts.visitorId);
  } else {
    localStorage.removeItem(VISITOR_ID_STORAGE_KEY);
  }

  // As the baby route's loader does on a client navigation.
  await harness.refresh();
  const feed = await loadTimelineFeed(harness.queryClient, {
    followedFrom: undefined,
    item: opts.item,
    publicId: opts.publicId,
  });
  return await renderWithTestRouter(
    <QueryClientProvider client={harness.queryClient}>
      <ConvexProvider
        // @ts-expect-error — integration client is not ConvexReactClient
        client={harness.convexClient}
      >
        <LocaleProvider locale="en-GB">
          <TimelineFeed
            baby={opts.baby}
            babyName={opts.baby.name}
            feed={feed}
            isOwner={opts.isOwner}
            publicId={opts.publicId}
            visitorTag={harness.queryClient.prefetch(visitorTagQuery, opts.babyId)}
          />
        </LocaleProvider>
      </ConvexProvider>
    </QueryClientProvider>,
    { path: `/baby/${opts.publicId}` },
  );
}

async function updateRow(view: ReturnType<typeof render>, message: string) {
  const messageNode = await view.findByText(message);
  const row = messageNode.closest(".group");
  if (!row) {
    throw new Error(`Timeline row missing for "${message}"`);
  }
  return within(htmlElement(row));
}

test("the status radio group is labelled and offers only future stages", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    locale: undefined,
  });
  const view = composer.view;

  const group = view.getByRole("radiogroup", { name: "Status change (optional)" });
  expect(group).toBeTruthy();

  expect(view.getByRole("radio", { name: "No change" }).getAttribute("aria-checked")).toBe("true");
  expect(view.getByRole("radio", { name: "Labour started" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Gone to hospital" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Baby born" })).toBeTruthy();

  composer.setBaby(laborStartedBaby);
  expect(view.queryByRole("radio", { name: "Labour started" })).toBeNull();
  expect(view.getByRole("radio", { name: "Gone to hospital" })).toBeTruthy();
});

test("the milestone metadata resolves through the Swedish catalog", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    locale: "sv",
  });
  const view = composer.view;

  expect(view.getByRole("radiogroup", { name: "Statusändring (valfritt)" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Ingen ändring" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Förlossningen är igång" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Åkt in till förlossningen" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Bäbisen är född" })).toBeTruthy();
});

test("the composer only offers visible future milestones", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: {
      ...notYetBaby,
      laborStarted: "2026-08-20T08:00:00.000Z",
      milestoneVisibility: { showHospital: true, showLabor: false },
    },
    babyId: baby.babyId,
    locale: undefined,
  });
  const view = composer.view;

  expect(view.queryByRole("radio", { name: "Labour started" })).toBeNull();
  expect(view.getByRole("radio", { name: "Gone to hospital" })).toBeTruthy();
  expect(view.getByRole("radio", { name: "Baby born" })).toBeTruthy();
});

test("a stale milestone selection is cleared when the status advances elsewhere", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    locale: undefined,
  });
  const view = composer.view;

  fireEvent.click(view.getByRole("radio", { name: "Labour started" }));
  expect(view.getByRole("radio", { name: "Labour started" }).getAttribute("aria-checked")).toBe(
    "true",
  );

  composer.setBaby(laborStartedBaby);
  expect(view.getByRole("radio", { name: "No change" }).getAttribute("aria-checked")).toBe("true");

  composer.setBaby(notYetBaby);
  expect(view.getByRole("radio", { name: "Labour started" }).getAttribute("aria-checked")).toBe(
    "false",
  );
  expect(view.getByRole("radio", { name: "No change" }).getAttribute("aria-checked")).toBe("true");
});

test("an empty event-time picker does not post occurredAt", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    locale: undefined,
  });
  const view = composer.view;
  const postedBefore = Date.now();

  fireEvent.click(view.getByRole("radio", { name: "Labour started" }));
  const picker = htmlInput(view.getByLabelText(/when did labour start/i));
  expect(picker.value).toBe("");
  fireEvent.click(view.getByRole("button", { name: "Post update" }));

  await vi.waitFor(async () => {
    const feed = await harness.client.query(api.timeline.listByBaby, {
      babyId: baby.publicId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    const milestoneUpdate = feed.page.find(
      (item) => item.kind === "update" && item.update.milestone === "labor_started",
    );
    if (milestoneUpdate?.kind !== "update") {
      throw new Error("expected milestone update");
    }
    expect(milestoneUpdate.update.occurredAt).toBeGreaterThanOrEqual(postedBefore);
    expect(milestoneUpdate.update.occurredAt).toBeLessThanOrEqual(Date.now() + 60_000);
  });
});

test("a filled event-time picker posts the backdated occurredAt", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    locale: undefined,
  });
  const view = composer.view;

  fireEvent.click(view.getByRole("radio", { name: "Labour started" }));
  fireEvent.change(view.getByLabelText(/when did labour start/i), {
    target: { value: "2026-08-10T08:30" },
  });
  fireEvent.click(view.getByRole("button", { name: "Post update" }));

  await vi.waitFor(async () => {
    const feed = await harness.client.query(api.timeline.listByBaby, {
      babyId: baby.publicId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    const milestoneUpdate = feed.page.find(
      (item) => item.kind === "update" && item.update.milestone === "labor_started",
    );
    if (milestoneUpdate?.kind !== "update") {
      throw new Error("expected milestone update");
    }
    expect(milestoneUpdate.update.occurredAt).toBe(Date.parse("2026-08-10T07:30:00.000Z"));
  });
});

test("the composer previews a selected photo and can remove it", async () => {
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  await using _objectUrls = makeResource({}, () => {
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using composer = await renderComposer(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    locale: undefined,
  });
  const view = composer.view;

  const fileInput = view.container.querySelector('input[type="file"]');
  if (!fileInput) {
    throw new Error("hidden file input missing");
  }

  fireEvent.change(fileInput, {
    target: { files: [new File(["png"], "baby.png", { type: "image/png" })] },
  });
  await vi.waitFor(() => {
    expect(view.getByAltText("Photo to post")).toBeTruthy();
  });

  fireEvent.click(view.getByRole("button", { name: "Remove photo" }));
  expect(view.queryByAltText("Photo to post")).toBeNull();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

test("timeline milestone deletion is disabled while a later status exists", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await postTestUpdate(harness, {
    babyId: baby.babyId,
    milestone: "labor_started",
  });
  await postTestUpdate(harness, {
    babyId: baby.babyId,
    milestone: "gone_to_hospital",
  });
  await postTestUpdate(harness, {
    babyId: baby.babyId,
    milestone: "born",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: {
      ...laborStartedBaby,
      babyBorn: "2026-08-21T03:00:00.000Z",
      wentToHospital: "2026-08-20T12:00:00.000Z",
    },
    babyId: baby.babyId,
    isOwner: true,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  const blockedDeleteButtons = feed
    .getAllByRole("button", { name: "Delete update" })
    .filter((button) => htmlButton(button).disabled);
  expect(blockedDeleteButtons.length).toBeGreaterThan(0);
  const deleteButton = htmlButton(blockedDeleteButtons[0]);
  const tooltipTrigger = deleteButton.closest('[data-slot="tooltip-trigger"]');
  if (!tooltipTrigger) {
    throw new Error("Tooltip trigger missing");
  }
  expect(tooltipTrigger.getAttribute("aria-label")).toBe("Delete the Born status first");
  expect(feed.queryByRole("alertdialog")).toBeNull();
});

test("shows the loaded first page instead of a spinner while the live query syncs", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  expect(feed.queryByText("Loading the timeline...")).toBeNull();
  expect(feed.getByText("Grandma")).toBeTruthy();
  expect(feed.getByText("Can't wait to meet you!")).toBeTruthy();
});

test("does not pop in encouragements from the first loaded page", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  expect(feed.getByText("Can't wait to meet you!").closest("[data-live-insert]")).toBeNull();
});

test("pops in an encouragement that arrives after the first snapshot", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  await harness.convexClient.mutation(api.encouragements.create, {
    authorName: "Auntie",
    babyId: baby.babyId,
    locale: null,
    message: "So exciting!",
    timezone: null,
    userAgent: null,
    visitorId: "visitor-live",
  });

  const liveMessage = await vi.waitFor(() => feed.getByText("So exciting!"));
  expect(liveMessage.closest("[data-live-insert]")).not.toBeNull();
  expect(feed.getByText("Can't wait to meet you!").closest("[data-live-insert]")).toBeNull();
});

test("pops in the first encouragement on a previously empty feed", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });
  expect(feed.getByText("Nothing here yet")).toBeTruthy();

  await harness.convexClient.mutation(api.encouragements.create, {
    authorName: "Auntie",
    babyId: baby.babyId,
    locale: null,
    message: "Hello little one!",
    timezone: null,
    userAgent: null,
    visitorId: "visitor-live",
  });

  const liveMessage = await vi.waitFor(() => feed.getByText("Hello little one!"));
  expect(liveMessage.closest("[data-live-insert]")).not.toBeNull();
});

test("shows the empty feed, not a spinner, when the loaded first page is empty", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  expect(feed.queryByText("Loading the timeline...")).toBeNull();
  expect(feed.getByText("Nothing here yet")).toBeTruthy();
});

test("renders historical milestone badges regardless of current selection", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await postTestUpdate(harness, {
    babyId: baby.babyId,
    message: "A family update",
    milestone: "labor_started",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: {
      ...notYetBaby,
      laborStarted: "2026-08-20T08:00:00.000Z",
      milestoneVisibility: { showHospital: true, showLabor: false },
    },
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  expect(feed.getByText("A family update")).toBeTruthy();
  expect(feed.getByText("Labour started")).toBeTruthy();
});

test("timeline avatars stay decorative beside the visible author name", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });
  await postTestUpdate(harness, { babyId: baby.babyId, message: "A family update" });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: true,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  const encouragement = await updateRow(feed, "Can't wait to meet you!");
  expect(encouragement.getByText("Grandma")).toBeTruthy();
  const initials = encouragement.getAllByText("G");
  expect(initials.length).toBeGreaterThan(0);
  for (const initial of initials) {
    expect(initial.getAttribute("aria-hidden")).toBe("true");
  }

  const update = await updateRow(feed, "A family update");
  expect(update.getByText("Baby Smith's family")).toBeTruthy();
  const bubbles = update.getAllByText("💬");
  expect(bubbles.length).toBeGreaterThan(0);
  for (const bubble of bubbles) {
    expect(bubble.getAttribute("aria-hidden")).toBe("true");
  }
});

test("timeline photos link to the update photo overlay", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  const seeded = await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Smile!",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  const photoLink = feed.getByRole("link", { name: "View photo full size" });
  expect(photoLink.getAttribute("href")).toBe(
    `/baby/${baby.publicId}/updates/${seeded.updateId}/photo`,
  );
  const inline = htmlImage(feed.getByAltText("Baby update"));
  expect(inline.src).toContain("http");
});

test("owners can delete an encouragement and toast success", async () => {
  const toastSuccess = vi.spyOn((await import("sonner")).toast, "success");
  await using _toast = makeResource({}, () => {
    toastSuccess.mockRestore();
  });
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait!",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: true,
    publicId: baby.publicId,
    visitorId: undefined,
  });

  fireEvent.click(feed.getByRole("button", { name: "Delete message" }));
  fireEvent.click(feed.getByRole("button", { name: "Delete" }));

  await vi.waitFor(() => {
    expect(toastSuccess).toHaveBeenCalledWith("Message deleted");
  });
  await vi.waitFor(() => {
    expect(feed.queryByText("Can't wait!")).toBeNull();
  });
  const timeline = await harness.client.query(api.timeline.listByBaby, {
    babyId: baby.publicId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(timeline.page.some((item) => item.kind === "encouragement")).toBe(false);
});

test("authors can edit their own encouragement within the edit window", async () => {
  const toastSuccess = vi.spyOn((await import("sonner")).toast, "success");
  await using _toast = makeResource({}, () => {
    toastSuccess.mockRestore();
  });
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await harness.withIdentity(null);
  await harness.client.mutation(api.encouragements.create, {
    authorName: "Me",
    babyId: baby.babyId,
    locale: null,
    message: "Original message",
    timezone: null,
    userAgent: null,
    visitorId: "visitor-1",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: "visitor-1",
  });

  await vi.waitFor(() => {
    expect(feed.getByRole("button", { name: "Edit message" })).toBeTruthy();
  });
  fireEvent.click(feed.getByRole("button", { name: "Edit message" }));
  const textarea = feed.getByLabelText("Edit your message");
  fireEvent.change(textarea, { target: { value: "Updated message" } });
  fireEvent.click(feed.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(toastSuccess).toHaveBeenCalledWith("Message updated");
  });
  const timeline = await harness.client.query(api.timeline.listByBaby, {
    babyId: baby.publicId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(
    timeline.page.some(
      (item) => item.kind === "encouragement" && item.encouragement?.message === "Updated message",
    ),
  ).toBe(true);
});

test("other visitors cannot edit someone else's encouragement", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await harness.withIdentity(null);
  await harness.client.mutation(api.encouragements.create, {
    authorName: "Someone",
    babyId: baby.babyId,
    locale: null,
    message: "Not yours",
    timezone: null,
    userAgent: null,
    visitorId: "visitor-1",
  });

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: "visitor-2",
  });

  await vi.waitFor(() => {
    expect(feed.getByText("Not yours")).toBeTruthy();
  });
  expect(feed.queryByRole("button", { name: "Edit message" })).toBeNull();
  expect(feed.queryByText("(you)")).toBeNull();
});

test("update delete and set-as-photo handlers toast on success and error", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Smile!",
  });
  const toast = (await import("sonner")).toast;
  const toastSuccess = vi.spyOn(toast, "success");
  const toastError = vi.spyOn(toast, "error");
  await using _toast = makeResource({}, () => {
    toastSuccess.mockRestore();
    toastError.mockRestore();
  });

  {
    await using feed = await renderTimelineFeed(harness, {
      baby: notYetBaby,
      babyId: baby.babyId,
      isOwner: true,
      publicId: baby.publicId,
      visitorId: undefined,
    });
    fireEvent.click(feed.getByRole("button", { name: "Delete update" }));
    fireEvent.click(feed.getByRole("button", { name: /^Delete$/i }));
    await vi.waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Update removed");
    });
    const afterDelete = await harness.client.query(api.timeline.listByBaby, {
      babyId: baby.publicId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    expect(afterDelete.page.some((item) => item.kind === "update")).toBe(false);
  }

  await harness.client.mutation(api.baby.updatePhoto, {
    babyId: baby.babyId,
    photoId: await storeTestBlob(harness),
  });
  await settleScheduledFunctions(harness);
  await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Second photo",
  });
  {
    await using feed = await renderTimelineFeed(harness, {
      baby: notYetBaby,
      babyId: baby.babyId,
      isOwner: true,
      publicId: baby.publicId,
      visitorId: undefined,
    });
    await vi.waitFor(() => {
      expect(feed.getByRole("button", { name: "Set as page photo" })).toBeTruthy();
    });
    fireEvent.click(feed.getByRole("button", { name: "Set as page photo" }));
    await vi.waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Page photo updated");
    });
  }

  await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Delete me",
  });
  const originalMutation = harness.convexClient.mutation.bind(harness.convexClient);
  const mutationSpy = vi
    .spyOn(harness.convexClient, "mutation")
    .mockImplementation(async (mutation, args) => {
      if (isMutationArgsRecord(args) && "updateId" in args && !("encouragementId" in args)) {
        throw new Error("nope");
      }
      return await originalMutation(mutation, args);
    });
  await using _mutationSpy = makeResource({}, () => {
    mutationSpy.mockRestore();
  });

  {
    await using feed = await renderTimelineFeed(harness, {
      baby: notYetBaby,
      babyId: baby.babyId,
      isOwner: true,
      publicId: baby.publicId,
      visitorId: undefined,
    });
    const row = await updateRow(feed, "Delete me");
    fireEvent.click(row.getByRole("button", { name: "Delete update" }));
    fireEvent.click(feed.getByRole("button", { name: /^Delete$/i }));
    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("nope");
    });
  }

  mutationSpy.mockRestore();
  await seedTimelineUpdateWithPhoto(harness, {
    babyId: baby.babyId,
    message: "Pin fail",
  });
  vi.spyOn(harness.convexClient, "mutation").mockImplementation(async (mutation, args) => {
    if (isMutationArgsRecord(args) && "updateId" in args && !("encouragementId" in args)) {
      throw new Error("offline");
    }
    return await originalMutation(mutation, args);
  });

  {
    await using feed = await renderTimelineFeed(harness, {
      baby: notYetBaby,
      babyId: baby.babyId,
      isOwner: true,
      publicId: baby.publicId,
      visitorId: undefined,
    });
    await vi.waitFor(() => {
      expect(feed.getAllByRole("button", { name: "Set as page photo" }).length).toBeGreaterThan(0);
    });
    fireEvent.click(feed.getAllByRole("button", { name: "Set as page photo" })[0]!);
    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("offline");
    });
  }
});

test("EncouragementForm mounts through the Convex provider", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);

  await using view = await renderWithConvexTest({
    harness,
    ui: <EncouragementForm accountName={null} babyId={baby.babyId} babyName={notYetBaby.name} />,
    wrap: null,
  });

  expect(view.getAllByText("Send some love").length).toBeGreaterThan(0);
  expect(view.getByLabelText("Your name")).toBeTruthy();
  expect(view.getByLabelText("Message")).toBeTruthy();
});

test("EncouragementForm restores a session draft silently", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  sessionStorage.setItem(
    `encouragement-message-draft:${baby.babyId}`,
    JSON.stringify({
      authorName: "Auntie Jo",
      message: "Saved draft text",
      savedAt: Date.now(),
    }),
  );

  await using view = await renderWithConvexTest({
    harness,
    ui: <EncouragementForm accountName={null} babyId={baby.babyId} babyName={notYetBaby.name} />,
    wrap: null,
  });

  expect(htmlInput(view.getByLabelText("Your name")).value).toBe("Auntie Jo");
  expect(htmlTextArea(view.getByLabelText("Message")).value).toBe("Saved draft text");
});

test("EncouragementForm prefers a session name draft over committed localStorage", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  localStorage.setItem("encouragement-author-name", "Committed Name");
  sessionStorage.setItem(
    `encouragement-message-draft:${baby.babyId}`,
    JSON.stringify({
      authorName: "Draft Name",
      message: "Saved draft text",
      savedAt: Date.now(),
    }),
  );

  await using view = await renderWithConvexTest({
    harness,
    ui: <EncouragementForm accountName={null} babyId={baby.babyId} babyName={notYetBaby.name} />,
    wrap: null,
  });

  expect(htmlInput(view.getByLabelText("Your name")).value).toBe("Draft Name");
});

test("EncouragementForm prefills the account name when localStorage is empty", async () => {
  localStorage.removeItem("encouragement-author-name");
  sessionStorage.clear();
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);

  await using view = await renderWithConvexTest({
    harness,
    ui: (
      <EncouragementForm
        accountName="Ada Lovelace"
        babyId={baby.babyId}
        babyName={notYetBaby.name}
      />
    ),
    wrap: null,
  });

  expect(htmlInput(view.getByLabelText("Your name")).value).toBe("Ada Lovelace");
});

test("a first-time visitor's new encouragement is marked as theirs", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await harness.withIdentity(null);

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });
  await using form = await renderWithConvexTest({
    harness,
    ui: <EncouragementForm accountName={null} babyId={baby.babyId} babyName={notYetBaby.name} />,
    wrap: null,
  });

  fireEvent.change(form.getByLabelText("Your name"), { target: { value: "New Visitor" } });
  fireEvent.change(form.getByLabelText("Message"), { target: { value: "First post!" } });
  fireEvent.click(form.getByRole("button", { name: "Send some love" }));

  await vi.waitFor(() => {
    expect(feed.getByText("First post!")).toBeTruthy();
    expect(feed.getByText("(you)")).toBeTruthy();
  });
});

test("EncouragementForm submit reaches the Convex mutation", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);

  await using view = await renderWithConvexTest({
    harness,
    ui: <EncouragementForm accountName={null} babyId={baby.babyId} babyName={notYetBaby.name} />,
    wrap: null,
  });

  fireEvent.change(view.getByLabelText("Your name"), { target: { value: "Auntie Jo" } });
  fireEvent.change(view.getByLabelText("Message"), { target: { value: "Thinking of you!" } });
  fireEvent.click(view.getByRole("button", { name: "Send some love" }));

  await vi.waitFor(() => {
    expect(htmlButton(view.getByRole("button", { name: "Send some love" })).disabled).toBe(false);
  });

  const feed = await harness.client.query(api.timeline.listByBaby, {
    babyId: baby.publicId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(
    feed.page.some(
      (item) => item.kind === "encouragement" && item.encouragement?.message === "Thinking of you!",
    ),
  ).toBe(true);
  expect(sessionStorage.getItem(`encouragement-message-draft:${baby.babyId}`)).toBeNull();
});

// --- Infinite scroll: the skeleton is the sentinel ---

type TimelinePageItems = FunctionReturnType<typeof api.timeline.listByBaby>["page"];

/**
 * A controllable IntersectionObserver: nothing intersects until the test calls
 * `intersect()`, which (like the browser) only reaches observers that are
 * still watching a node.
 */
function stubIntersectionObserver() {
  const observers: Array<FakeIntersectionObserver> = [];

  class FakeIntersectionObserver implements IntersectionObserver {
    readonly callback: IntersectionObserverCallback;
    disconnected = false;
    readonly root = null;
    readonly rootMargin: string;
    readonly scrollMargin = "0px";
    targets: Array<Element> = [];
    readonly thresholds: ReadonlyArray<number>;

    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
      this.callback = callback;
      this.rootMargin = options.rootMargin ?? "0px";
      this.thresholds = [options.threshold ?? 0].flat();
      observers.push(this);
    }
    observe(target: Element) {
      this.targets.push(target);
    }
    unobserve(target: Element) {
      this.targets = this.targets.filter((candidate) => candidate !== target);
    }
    disconnect() {
      this.disconnected = true;
      this.targets = [];
    }
    takeRecords() {
      return [];
    }
    fire() {
      this.callback(
        this.targets.map(
          (target) =>
            /* SAFETY: the hook under test only reads isIntersecting and target. */
            ({ isIntersecting: true, target }) as IntersectionObserverEntry,
        ),
        this,
      );
    }
  }

  const original = globalThis.IntersectionObserver;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  const watching = () => observers.filter((observer) => observer.targets.length > 0);
  return makeResource(
    {
      intersect() {
        for (const observer of watching()) {
          observer.fire();
        }
      },
      observers,
      watching,
    },
    () => {
      vi.stubGlobal("IntersectionObserver", original);
    },
  );
}

function timelineFeedViewTree(opts: {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  items: TimelinePageItems;
}) {
  return (
    <LocaleProvider locale="en-GB">
      <TimelineFeedView
        anchor={{ kind: "latest" }}
        baby={notYetBaby}
        babyName={notYetBaby.name}
        currentVisitorId="visitor-test"
        currentVisitorTag={null}
        fetchNextPage={opts.fetchNextPage}
        hasNextPage={opts.hasNextPage}
        highlightedItemId={null}
        isFetchingNextPage={opts.isFetchingNextPage}
        isOwner={false}
        items={opts.items}
        linkUnavailable={false}
        newer={null}
        publicId="baby-smith"
        removeEncouragement={vi.fn()}
        removeUpdate={vi.fn()}
        setAsCurrentPhoto={vi.fn()}
        updateEncouragement={vi.fn()}
      />
    </LocaleProvider>
  );
}

async function seedFirstTimelinePage(harness: ConvexTestHarness) {
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });
  const firstPage = await harness.client.query(api.timeline.listByBaby, {
    babyId: baby.publicId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  return firstPage.page;
}

test("while more pages exist the feed ends in a skeleton that is the scroll sentinel", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const items = await seedFirstTimelinePage(harness);

  await using feed = await renderWithTestRouter(
    timelineFeedViewTree({
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
      items,
    }),
  );

  const sentinel = feed.getByTestId("timeline-load-more");
  const skeletons = sentinel.querySelectorAll('[data-slot="skeleton"]');
  expect(sentinel.querySelectorAll(':scope > [aria-hidden="true"]')).toHaveLength(3);
  for (const skeleton of skeletons) {
    expect(skeleton.closest('[aria-hidden="true"]')).not.toBeNull();
  }
  expect(within(sentinel).getByRole("status").textContent).toBe("");
  expect(feed.container.querySelector('[aria-busy="true"]')).toBeNull();

  const watching = io.watching();
  expect(watching).toHaveLength(1);
  expect(watching[0]?.targets).toEqual([sentinel]);
  expect(watching[0]?.rootMargin).toBe("0px 0px 400px 0px");
});

test("reaching the skeleton fetches the next page once and not again while it loads", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const items = await seedFirstTimelinePage(harness);
  const fetchNextPage = vi.fn<() => void>();
  const state = { fetchNextPage, hasNextPage: true, isFetchingNextPage: false, items };

  await using feed = await renderWithTestRouter(timelineFeedViewTree(state));

  io.intersect();
  expect(fetchNextPage).toHaveBeenCalledTimes(1);

  feed.rerender(timelineFeedViewTree({ ...state, isFetchingNextPage: true }));
  expect(io.watching()).toHaveLength(0);
  io.intersect();
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  expect(feed.getByTestId("timeline-load-more")).toBeTruthy();
  expect(feed.getByRole("status").textContent).toBe("Loading more updates & messages…");
  expect(feed.container.querySelector('[aria-busy="true"]')).not.toBeNull();

  // The page landed and more remain: a fresh observer re-arms the skeleton.
  feed.rerender(timelineFeedViewTree(state));
  expect(io.watching()).toHaveLength(1);
  io.intersect();
  expect(fetchNextPage).toHaveBeenCalledTimes(2);
});

test("the last page removes the skeleton and disconnects its observer", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const items = await seedFirstTimelinePage(harness);
  const fetchNextPage = vi.fn<() => void>();
  const state = { fetchNextPage, hasNextPage: true, isFetchingNextPage: false, items };

  await using feed = await renderWithTestRouter(timelineFeedViewTree(state));
  expect(io.watching()).toHaveLength(1);

  feed.rerender(timelineFeedViewTree({ ...state, hasNextPage: false }));
  expect(feed.queryByTestId("timeline-load-more")).toBeNull();
  expect(feed.queryByRole("status")).toBeNull();
  expect(io.watching()).toHaveLength(0);
  expect(io.observers.every((observer) => observer.disconnected)).toBe(true);
  io.intersect();
  expect(fetchNextPage).not.toHaveBeenCalled();
});

test("an exhausted feed never renders a skeleton or creates an observer", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const items = await seedFirstTimelinePage(harness);

  await using feed = await renderWithTestRouter(
    timelineFeedViewTree({
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      items,
    }),
  );

  expect(feed.getByText("Can't wait to meet you!")).toBeTruthy();
  expect(feed.queryByTestId("timeline-load-more")).toBeNull();
  expect(io.observers).toHaveLength(0);
});

test("unmounting the feed disconnects the skeleton's observer", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const items = await seedFirstTimelinePage(harness);

  {
    await using _feed = await renderWithTestRouter(
      timelineFeedViewTree({
        fetchNextPage: vi.fn(),
        hasNextPage: true,
        isFetchingNextPage: false,
        items,
      }),
    );
    expect(io.watching()).toHaveLength(1);
  }

  expect(io.observers.length).toBeGreaterThan(0);
  expect(io.observers.every((observer) => observer.disconnected)).toBe(true);
});

test("an empty page with more to come shows the skeleton instead of the empty state", async () => {
  await using _io = stubIntersectionObserver();

  await using feed = await renderWithTestRouter(
    timelineFeedViewTree({
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
      items: [],
    }),
  );

  expect(feed.queryByText("Nothing here yet")).toBeNull();
  expect(feed.getByTestId("timeline-load-more")).toBeTruthy();
});

test("the server render includes the skeleton without creating an observer", async () => {
  await using io = stubIntersectionObserver();

  const html = renderToString(
    timelineFeedViewTree({
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
      items: [],
    }),
  );

  expect(html).toContain('data-testid="timeline-load-more"');
  expect(html).toContain('data-slot="skeleton"');
  expect(io.observers).toHaveLength(0);
});

test("a live encouragement during the next-page fetch neither duplicates nor drops items", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  const seededMessages = Array.from({ length: 24 }, (_, index) => `Older message ${index + 1}`);
  for (const message of seededMessages) {
    await seedTimelineEncouragement(harness, {
      authorName: "Family",
      babyId: baby.babyId,
      message,
    });
  }

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    publicId: baby.publicId,
    visitorId: undefined,
  });
  await vi.waitFor(() => {
    expect(io.watching()).toHaveLength(1);
  });
  expect(feed.queryByText("Older message 1")).toBeNull();

  io.intersect();
  await harness.convexClient.mutation(api.encouragements.create, {
    authorName: "Auntie",
    babyId: baby.babyId,
    locale: null,
    message: "Live while paging",
    timezone: null,
    userAgent: null,
    visitorId: "visitor-live",
  });

  await vi.waitFor(() => {
    expect(feed.getByText("Live while paging")).toBeTruthy();
    expect(feed.getByText("Older message 1")).toBeTruthy();
    expect(feed.queryByTestId("timeline-load-more")).toBeNull();
  });
  for (const message of [...seededMessages, "Live while paging"]) {
    expect(feed.getAllByText(message)).toHaveLength(1);
  }
  expect(feed.container.querySelectorAll(".group")).toHaveLength(seededMessages.length + 1);
});

// --- Linked items (`?item=`) ---

/** Linked at `Message 30`, with `Message 31` to `Message 55` newer by default. */
const LINKED_INDEX = 30;
const NEWER_COUNT = 25;
const LINKED_MESSAGE = `Message ${LINKED_INDEX}`;

/**
 * `olderCount` messages below the linked one and `newerCount` above it.
 * Tests that only page newer items keep `olderCount` small: jsdom re-renders
 * every row on each page.
 */
async function seedLinkedFeed(
  harness: ConvexTestHarness,
  opts: { newerCount: number; olderCount: number },
) {
  const baby = await seedOwnerBaby(harness);
  const newestIndex = LINKED_INDEX + opts.newerCount;
  for (let index = LINKED_INDEX - opts.olderCount; index <= newestIndex; index++) {
    await seedTimelineEncouragement(harness, {
      authorName: "Family",
      babyId: baby.babyId,
      message: `Message ${index}`,
    });
  }
  const all = await harness.client.query(api.timeline.listByBaby, {
    babyId: baby.publicId,
    paginationOpts: { cursor: null, numItems: newestIndex + 1 },
  });
  const linked = all.page.find(
    (item) => item.kind === "encouragement" && item.encouragement.message === LINKED_MESSAGE,
  );
  if (!linked) {
    throw new Error("Linked item missing");
  }
  return { baby, itemId: linked._id };
}

async function renderLinkedFeed(
  harness: ConvexTestHarness,
  opts: { newerCount: number; olderCount: number },
) {
  const seeded = await seedLinkedFeed(harness, opts);
  const feed = await renderTimelineFeedFrom(harness, {
    baby: notYetBaby,
    babyId: seeded.baby.babyId,
    isOwner: false,
    item: seeded.itemId,
    publicId: seeded.baby.publicId,
    visitorId: undefined,
  });
  return Object.assign(feed, {
    babyId: seeded.baby.babyId,
    itemId: seeded.itemId,
    publicId: seeded.baby.publicId,
  });
}

/** The messages on screen, top to bottom. */
function feedMessages(view: ReturnType<typeof render>) {
  return Array.from(view.container.querySelectorAll('[id^="item-"]'), (row) =>
    row.textContent.match(/Message \d+|Live[\w ]+/)?.at(0),
  );
}

function linkedRow(view: ReturnType<typeof render>) {
  return htmlElement(view.container.querySelector('[aria-current="true"]'));
}

/**
 * The divider's button, named by how many newer items are hidden and how many it shows.
 *
 * Role queries are slow on a full feed: the first one after each render recomputes every
 * row's style in jsdom, and a `getByRole` miss also lists every role in its error. So poll
 * with `queryByRole` in `vi.waitFor`, and check the divider is gone rather than its button.
 */
const SHOW_MORE = /newer, Show \d+ more$/;

test("a linked item opens the feed at it, two newer items above it, the rest behind a divider", async () => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, {
    newerCount: NEWER_COUNT,
    olderCount: 29,
  });

  const linked = linkedRow(feed);
  expect(linked.id).toBe(`item-${feed.itemId}`);
  expect(linked.classList).toContain("timeline-linked-item");
  expect(linked.tabIndex).toBe(-1);
  expect(document.activeElement).toBe(linked);
  expect(within(linked).getByText(LINKED_MESSAGE)).toBeTruthy();

  const messages = feedMessages(feed);
  expect(messages).toHaveLength(22);
  expect(messages.slice(0, 3)).toEqual(["Message 32", "Message 31", LINKED_MESSAGE]);
  expect(messages.at(-1)).toBe("Message 11");
  expect(feed.container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  expect(feed.queryByText("Message 33")).toBeNull();

  const showMore = feed.getByRole("button", { name: "23 newer, Show 20 more" });
  expect(showMore.textContent).toBe("23 newer·Show 20 more");
  // The divider sits above the context, the rules either side of it decorative.
  const divider = htmlElement(showMore.closest("[data-newer-divider]"));
  const firstRow = htmlElement(feed.container.querySelector('[id^="item-"]'));
  expect(divider.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const rules = divider.querySelectorAll('[aria-hidden="true"]:empty');
  expect(rules).toHaveLength(2);
  expect(within(divider).getByRole("link", { name: "Jump to latest" }).getAttribute("href")).toBe(
    `/baby/${feed.publicId}#feed`,
  );
});

test.each([
  { context: [], newerCount: 0 },
  { context: ["Message 31"], newerCount: 1 },
  { context: ["Message 32", "Message 31"], newerCount: 2 },
])("a linked item with $newerCount newer shows them all, with no divider", async (row) => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, { newerCount: row.newerCount, olderCount: 1 });

  expect(feedMessages(feed)).toEqual([...row.context, LINKED_MESSAGE, "Message 29"]);
  expect(linkedRow(feed).id).toBe(`item-${feed.itemId}`);
  expect(feed.queryByRole("button", { name: SHOW_MORE })).toBeNull();
  expect(feed.container.querySelector("[data-newer-divider]")).toBeNull();
  expect(feed.queryByRole("link", { name: "Jump to latest" })).toBeNull();
});

test("a linked item with one more newer than its context offers just that one", async () => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, { newerCount: 3, olderCount: 1 });

  expect(feedMessages(feed).slice(0, 3)).toEqual(["Message 32", "Message 31", LINKED_MESSAGE]);
  fireEvent.click(feed.getByRole("button", { name: "1 newer, Show 1 more" }));

  await vi.waitFor(() => {
    expect(feedMessages(feed)[0]).toBe("Message 33");
  });
  expect(feed.container.querySelector("[data-newer-divider]")).toBeNull();
});

test("the skeleton below a linked item loads older items and never newer ones", async () => {
  await using io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, {
    newerCount: NEWER_COUNT,
    olderCount: 29,
  });
  await vi.waitFor(() => {
    expect(io.watching()).toHaveLength(1);
  });
  expect(io.watching()[0]?.targets).toEqual([feed.getByTestId("timeline-load-more")]);

  io.intersect();

  await vi.waitFor(() => {
    expect(feed.getByText("Message 1")).toBeTruthy();
  });
  expect(feed.queryByTestId("timeline-load-more")).toBeNull();
  expect(feed.queryByText("Message 33")).toBeNull();
  expect(feed.getByRole("button", { name: "23 newer, Show 20 more" })).toBeTruthy();
});

test("Show more adds a page above the context in feed order, on click only", async () => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, {
    newerCount: NEWER_COUNT,
    olderCount: 2,
  });
  const linked = linkedRow(feed);

  fireEvent.click(feed.getByRole("button", { name: "23 newer, Show 20 more" }));

  await vi.waitFor(() => {
    expect(feed.queryByRole("button", { name: "3 newer, Show 3 more" })).not.toBeNull();
  });
  const messages = feedMessages(feed);
  expect(messages.slice(0, 23)).toEqual([
    ...Array.from({ length: 22 }, (_, index) => `Message ${52 - index}`),
    LINKED_MESSAGE,
  ]);
  // The same node, still marked: nothing re-mounted the linked item.
  expect(linkedRow(feed)).toBe(linked);

  fireEvent.click(feed.getByRole("button", { name: "3 newer, Show 3 more" }));

  await vi.waitFor(() => {
    expect(feedMessages(feed)[0]).toBe("Message 55");
  });
  expect(feed.container.querySelector("[data-newer-divider]")).toBeNull();
});

test("live items above a linked one raise the count until the reader catches up", async () => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, {
    newerCount: NEWER_COUNT,
    olderCount: 2,
  });
  const postLive = async (message: string) => {
    await harness.convexClient.mutation(api.encouragements.create, {
      authorName: "Auntie",
      babyId: feed.babyId,
      locale: null,
      message,
      timezone: null,
      userAgent: null,
      visitorId: "visitor-live",
    });
  };

  await postLive("Live before catching up");

  await vi.waitFor(() => {
    expect(feed.queryByRole("button", { name: "24 newer, Show 20 more" })).not.toBeNull();
  });
  expect(feed.queryByText("Live before catching up")).toBeNull();
  expect(feedMessages(feed).slice(0, 3)).toEqual(["Message 32", "Message 31", LINKED_MESSAGE]);

  fireEvent.click(feed.getByRole("button", { name: "24 newer, Show 20 more" }));
  await vi.waitFor(() => {
    expect(feed.queryByRole("button", { name: "4 newer, Show 4 more" })).not.toBeNull();
  });
  fireEvent.click(feed.getByRole("button", { name: "4 newer, Show 4 more" }));
  await vi.waitFor(() => {
    expect(feedMessages(feed)[0]).toBe("Live before catching up");
  });
  expect(feed.container.querySelector("[data-newer-divider]")).toBeNull();

  // Caught up: the top of the feed is live again, like the latest feed.
  await postLive("Live after catching up");

  await vi.waitFor(() => {
    expect(feedMessages(feed)[0]).toBe("Live after catching up");
  });
  expect(feed.container.querySelector("[data-newer-divider]")).toBeNull();
});

test("a link deep in a busy feed says more than the cap are newer", async () => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  await using feed = await renderLinkedFeed(harness, { newerCount: 101, olderCount: 0 });

  expect(feed.getByRole("button", { name: "More than 98 newer, Show 20 more" })).toBeTruthy();
});

test("the server render has the context above the linked item and the divider above both", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const seeded = await seedLinkedFeed(harness, { newerCount: NEWER_COUNT, olderCount: 2 });
  await using server = stubQueryClientResource((query, args) => harness.client.query(query, args), {
    isServer: true,
  });
  const feed = await loadTimelineFeed(server.queryClient, {
    followedFrom: undefined,
    item: seeded.itemId,
    publicId: seeded.baby.publicId,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [`/baby/${seeded.baby.publicId}`] }),
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={server.queryClient}>
          <ConvexProvider
            // @ts-expect-error — integration client is not ConvexReactClient
            client={harness.convexClient}
          >
            <LocaleProvider locale="en-GB">
              <TimelineFeed
                baby={notYetBaby}
                babyName={notYetBaby.name}
                feed={feed}
                isOwner={false}
                publicId={seeded.baby.publicId}
                visitorTag={server.queryClient.prefetch(visitorTagQuery, seeded.baby.babyId)}
              />
            </LocaleProvider>
          </ConvexProvider>
        </QueryClientProvider>
      ),
    }),
  });
  await router.load();

  const html = renderToString(<RouterProvider router={router} />);

  const positions = [
    "23 newer",
    "Show 20 more",
    "Message 32",
    "Message 31",
    'aria-current="true"',
    LINKED_MESSAGE,
    "Message 29",
  ].map((text) => html.indexOf(text));
  expect(positions).not.toContain(-1);
  expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  expect(html).not.toContain("Message 33");
});

test("a link to an item that isn't here shows the latest items with a notice", async () => {
  await using _io = stubIntersectionObserver();
  await using harness = await createConvexTestHarness({ identity: null });
  const baby = await seedOwnerBaby(harness);
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });

  await using feed = await renderTimelineFeedFrom(harness, {
    baby: notYetBaby,
    babyId: baby.babyId,
    isOwner: false,
    item: "k57doesnotexist",
    publicId: baby.publicId,
    visitorId: undefined,
  });

  expect(
    feed.getByText("That update or message isn't here any more, so here's the latest."),
  ).toBeTruthy();
  expect(feed.getByRole("link", { name: "Dismiss notice" }).getAttribute("href")).toBe(
    `/baby/${baby.publicId}`,
  );
  expect(feed.getByText("Can't wait to meet you!")).toBeTruthy();
  expect(feed.container.querySelector('[aria-current="true"]')).toBeNull();
  expect(feed.queryByRole("button", { name: SHOW_MORE })).toBeNull();
});

async function seedUpdateAndEncouragement(harness: ConvexTestHarness) {
  const baby = await seedOwnerBaby(harness);
  await postTestUpdate(harness, { babyId: baby.babyId, message: "Family news" });
  await seedTimelineEncouragement(harness, {
    authorName: "Grandma",
    babyId: baby.babyId,
    message: "Can't wait to meet you!",
  });
  const items = (
    await harness.client.query(api.timeline.listByBaby, {
      babyId: baby.publicId,
      paginationOpts: { cursor: null, numItems: 20 },
    })
  ).page;
  const update = items.find((item) => item.kind === "update");
  const encouragement = items.find((item) => item.kind === "encouragement");
  if (update?.kind !== "update" || encouragement?.kind !== "encouragement") {
    throw new Error("Seeded items missing");
  }
  return { baby, encouragement, items, update };
}

test("every item's timestamp is its permalink, for updates and encouragements", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const seeded = await seedUpdateAndEncouragement(harness);

  await using feed = await renderTimelineFeed(harness, {
    baby: notYetBaby,
    babyId: seeded.baby.babyId,
    isOwner: false,
    publicId: seeded.baby.publicId,
    visitorId: "someone-else",
  });

  const updateLink = htmlElement(
    (await updateRow(feed, "Family news")).getByRole("link", { name: /link to this update$/ }),
  );
  expect(updateLink.getAttribute("href")).toBe(
    babyFeedItemUrl({ itemId: seeded.update._id, publicId: seeded.baby.publicId }),
  );
  expect(updateLink.querySelector("time")?.getAttribute("datetime")).toBe(
    new Date(seeded.update.postedAt).toISOString(),
  );
  expect(updateLink.getAttribute("aria-label")).toBe(
    `${updateLink.textContent}, link to this update`,
  );

  const encouragementRow = await updateRow(feed, "Can't wait to meet you!");
  const encouragementLink = htmlElement(
    encouragementRow.getByRole("link", { name: /link to this message$/ }),
  );
  expect(encouragementLink.getAttribute("href")).toBe(
    babyFeedItemUrl({ itemId: seeded.encouragement._id, publicId: seeded.baby.publicId }),
  );
  expect(encouragementLink.querySelector("time")?.getAttribute("datetime")).toBe(
    new Date(seeded.encouragement.encouragement.createdAt).toISOString(),
  );
  expect(feed.queryByRole("button", { name: /copy link/i })).toBeNull();
});

test("the server render links every timestamp", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const seeded = await seedUpdateAndEncouragement(harness);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/baby/baby-smith"] }),
    routeTree: createRootRoute({
      component: () =>
        timelineFeedViewTree({
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          items: seeded.items,
        }),
    }),
  });
  await router.load();

  const html = renderToString(<RouterProvider router={router} />);

  for (const item of [seeded.update, seeded.encouragement]) {
    expect(html).toContain(
      `href="${babyFeedItemUrl({ itemId: item._id, publicId: "baby-smith" })}"`,
    );
  }
  expect(html.match(/<time datetime="/gi)).toHaveLength(2);
});
