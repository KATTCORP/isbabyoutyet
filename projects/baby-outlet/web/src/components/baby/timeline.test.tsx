import { fireEvent, render, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import { expect, test, vi } from "vitest";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import type { BabyData } from "@baby-outlet/backend/src/types";
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import { isPlainObject } from "@workspace/runtime/guards";
import { CONVEX_INFINITE_QUERY_KEY } from "@workspace/convex-prefetch";
import { LocaleProvider } from "@/lib/i18n";
import { TimelineFeed, UpdateComposer } from "@/components/baby/timeline";
import { EncouragementForm } from "@/components/baby/encouragements";
import { createConvexTestHarness, type ConvexTestHarness } from "@/test/convexTestHarness";
import {
  seedOwnedBaby,
  seedTimelineEncouragement,
  seedTimelineUpdateWithPhoto,
  signUpTestUser,
  storeTestBlob,
  postTestUpdate,
} from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
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
  harness.withIdentity({ subject: ownerId });
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

async function prefetchTimeline(harness: ConvexTestHarness, publicId: string) {
  await harness.queryClient.invalidateQueries({ queryKey: [CONVEX_INFINITE_QUERY_KEY] });
  return await harness.convexPreloader.ensureInfiniteQueryData(api.timeline.listByBaby, {
    args: { babyId: publicId, visitorId: null },
    numItems: 20,
  });
}

async function renderTimelineFeed(
  harness: ConvexTestHarness,
  opts: {
    baby: BabyData;
    babyId: Id<"baby">;
    isOwner: boolean;
    publicId: string;
    visitorId: string | undefined;
  },
) {
  if (opts.visitorId) {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, opts.visitorId);
  } else {
    localStorage.removeItem(VISITOR_ID_STORAGE_KEY);
  }

  const timeline = await prefetchTimeline(harness, opts.publicId);
  return await renderWithTestRouter(
    <QueryClientProvider client={harness.queryClient}>
      <ConvexProvider
        // @ts-expect-error — integration client is not ConvexReactClient
        client={harness.convexClient}
      >
        <LocaleProvider locale="en-GB">
          <TimelineFeed
            baby={opts.baby}
            babyId={opts.babyId}
            babyName={opts.baby.name}
            isOwner={opts.isOwner}
            publicId={opts.publicId}
            timeline={timeline}
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
      visitorId: null,
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
      visitorId: null,
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
    visitorId: null,
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
    visitorId: "visitor-1",
  });
  expect(
    timeline.page.some(
      (item) => item.kind === "encouragement" && item.encouragement?.message === "Updated message",
    ),
  ).toBe(true);
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
      visitorId: null,
    });
    expect(afterDelete.page.some((item) => item.kind === "update")).toBe(false);
  }

  await harness.client.mutation(api.baby.updatePhoto, {
    babyId: baby.babyId,
    photoId: await storeTestBlob(harness),
  });
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
    visitorId: null,
  });
  expect(
    feed.page.some(
      (item) => item.kind === "encouragement" && item.encouragement?.message === "Thinking of you!",
    ),
  ).toBe(true);
  expect(sessionStorage.getItem(`encouragement-message-draft:${baby.babyId}`)).toBeNull();
});
