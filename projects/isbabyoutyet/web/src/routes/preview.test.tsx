import { fireEvent, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { Route, type PreviewSearch } from "@/routes/preview";

const baseSearch: PreviewSearch = {
  babyBorn: null,
  babyBornMessage: null,
  dueDate: "2026-09-01T00:00:00.000Z",
  laborStarted: "2026-08-10T08:00:00.000Z",
  laborStartedMessage: "It has begun!",
  name: "Nova",
  settings: true,
  wentToHospital: null,
};

function previewEntry(search: PreviewSearch) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (value === true || value === false) {
      if (value) {
        params.set(key, "true");
      }
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/preview?${query}` : "/preview";
}

test("preview routes settings and milestone edits to separate search updates", async () => {
  await using harness = await createConvexTestHarness({ identity: null });

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: previewEntry(baseSearch),
    overlayHistory: null,
    path: "/preview",
    route: Route,
    wrap: null,
  });

  await vi.waitFor(() => {
    expect(ctx.view.getByRole("dialog")).toBeTruthy();
  });

  const dialog = ctx.view.getByRole("dialog");
  fireEvent.click(within(dialog).getAllByRole("button", { name: "Edit" })[0]!);
  await vi.waitFor(() => {
    expect(ctx.view.getByLabelText("Baby name")).toBeTruthy();
  });
  fireEvent.change(ctx.view.getByLabelText("Baby name"), { target: { value: "Nova Rae" } });
  fireEvent.click(ctx.view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({ name: "Nova Rae" }),
      }),
    );
  });

  const laborEdit = within(dialog)
    .getAllByRole("button", { name: "Edit" })
    .find((button) => button.closest("[data-slot=item]")?.textContent?.includes("Labour started"));
  if (!laborEdit) {
    throw new Error("labor started edit button missing");
  }
  fireEvent.click(laborEdit);
  const dateInput = ctx.view.getByLabelText("Status date and time");
  fireEvent.change(dateInput, { target: { value: "2026-08-10T12:00" } });
  fireEvent.click(ctx.view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({
          laborStarted: "2026-08-10T11:00:00.000Z",
        }),
      }),
    );
  });

  fireEvent.click(laborEdit);
  fireEvent.click(ctx.view.getByRole("button", { name: "Delete" }));
  fireEvent.click(ctx.view.getByRole("button", { name: "Delete status" }));

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        search: expect.objectContaining({ laborStarted: null }),
      }),
    );
  });
});

test("preview derives a born status from its search dates", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const search: PreviewSearch = {
    ...baseSearch,
    babyBorn: "2026-08-11T03:00:00.000Z",
    babyBornMessage: "She's here!",
    settings: false,
  };

  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: previewEntry(search),
    overlayHistory: null,
    path: "/preview",
    route: Route,
    wrap: null,
  });

  expect(ctx.view.getByRole("heading", { name: "Is Nova out yet?" })).toBeTruthy();
});

test("preview still supplies localized no-index metadata after the schema cutover", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<unknown>;
  } = Route.options.head;
  const result = head({
    match: { context: { locale: "en-GB" } },
  });
  expect(result.meta.length).toBeGreaterThan(2);
});
