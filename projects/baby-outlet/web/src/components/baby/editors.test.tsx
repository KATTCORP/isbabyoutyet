import { fireEvent, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  DueDateEditor,
  NameEditor,
  StatusDateEditor,
  ThemeSelector,
} from "@/components/baby/editors";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { BABY_BLUE_THEME } from "@baby-outlet/backend/src/theme";
import type {
  BabyData,
  BabyUpdateHandler,
  MilestoneRedateHandler,
  MilestoneRemoveHandler,
} from "@baby-outlet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn<(message: string) => void>(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

const baby: BabyData = {
  name: "Nova",
  dueDate: "2026-09-01",
  dueDateDisplayMode: "exact",
  publicDueDateText: null,
  laborStarted: null,
  wentToHospital: null,
  babyBorn: null,
};

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("name editor mounts fresh on open: current name, reassurance note, trimmed save", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(<NameEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));

  // The form mounted with the current name and the link reassurance
  const input = view.getByLabelText("Baby name") as HTMLInputElement;
  expect(input.value).toBe("Nova");
  expect(view.getByText(/links you have already shared will keep working/i)).toBeTruthy();

  // Save is dirty-gated
  const saveButton = view.getByRole("button", { name: "Save" }) as HTMLButtonElement;
  expect(saveButton.disabled).toBe(true);

  fireEvent.change(input, { target: { value: "  Nova Rae  " } });
  expect(saveButton.disabled).toBe(false);
  fireEvent.click(saveButton);

  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ name: "Nova Rae" }));
  // The popover closed after a successful save
  await vi.waitFor(() => expect(view.queryByLabelText("Baby name")).toBeNull());
});

test("due date editor encodes the picker value as a UTC midnight instant", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const input = view.getByLabelText("Due date") as HTMLInputElement;
  expect(input.value).toBe("2026-09-01");
  expect(
    view.getByRole("switch", { name: "Show exact due date" }).getAttribute("aria-checked"),
  ).toBe("true");
  expect(view.queryByLabelText("Public due date message")).toBeNull();

  fireEvent.change(input, { target: { value: "2026-10-15" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(onUpdate).toHaveBeenCalledWith({
      dueDate: "2026-10-15T00:00:00.000Z",
      dueDateDisplayMode: "exact",
      publicDueDateText: null,
    }),
  );
});

test("due date editor requires and saves a custom visitor message", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.click(view.getByRole("switch", { name: "Show exact due date" }));
  const publicMessageInput = view.getByLabelText("Public due date message") as HTMLInputElement;
  expect(publicMessageInput.placeholder).toBe("September baby");
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await vi.waitFor(() => {
    expect(view.getByText("Enter a message for visitors")).toBeTruthy();
  });
  expect(onUpdate).not.toHaveBeenCalled();

  fireEvent.change(publicMessageInput, { target: { value: "  Any day now  " } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await vi.waitFor(() =>
    expect(onUpdate).toHaveBeenCalledWith({
      dueDate: "2026-09-01T00:00:00.000Z",
      dueDateDisplayMode: "message",
      publicDueDateText: "Any day now",
    }),
  );
});

test("due date editor toggles modes without losing either field value", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(
    <DueDateEditor
      baby={{
        ...baby,
        dueDateDisplayMode: "message",
        publicDueDateText: "Any day now",
      }}
      onUpdate={onUpdate}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const exactSwitch = view.getByRole("switch", { name: "Show exact due date" });
  expect(exactSwitch.getAttribute("aria-checked")).toBe("false");
  expect((view.getByLabelText("Public due date message") as HTMLInputElement).value).toBe(
    "Any day now",
  );
  fireEvent.click(exactSwitch);
  expect(view.queryByLabelText("Public due date message")).toBeNull();
  expect((view.getByLabelText("Due date") as HTMLInputElement).value).toBe("2026-09-01");
  fireEvent.click(exactSwitch);
  expect((view.getByLabelText("Public due date message") as HTMLInputElement).value).toBe(
    "Any day now",
  );
  fireEvent.click(exactSwitch);
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(onUpdate).toHaveBeenCalledWith({
      dueDate: "2026-09-01T00:00:00.000Z",
      dueDateDisplayMode: "exact",
      publicDueDateText: "Any day now",
    }),
  );
});

test("reopening the editor picks up the latest name without any reset", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(<NameEditor baby={baby} onUpdate={onUpdate} />);

  // Open, type a draft, then cancel — the draft must not survive
  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.change(view.getByLabelText("Baby name"), { target: { value: "Scrapped draft" } });
  fireEvent.click(view.getByRole("button", { name: "Cancel" }));
  await vi.waitFor(() => expect(view.queryByLabelText("Baby name")).toBeNull());

  // The name changes from outside (e.g. the mutation round-trip)
  view.rerender(<NameEditor baby={{ ...baby, name: "Nova Rae" }} onUpdate={onUpdate} />);

  // Reopening mounts a fresh form seeded with the latest name
  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const input = view.getByLabelText("Baby name") as HTMLInputElement;
  expect(input.value).toBe("Nova Rae");
});

test("status editor saves the matching milestone instant", async () => {
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);
  const laborBaby = { ...baby, laborStarted: "2026-08-10T08:00:00.000Z" };
  await using view = renderResource(
    <StatusDateEditor
      baby={laborBaby}
      status="labor_started"
      currentDate={laborBaby.laborStarted}
      onRedate={onRedate}
      onRemove={onRemove}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.change(view.getByLabelText("Status date and time"), {
    target: { value: "2026-08-10T09:30" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(onRedate).toHaveBeenCalledWith(
      "labor_started",
      new Date("2026-08-10T09:30").toISOString(),
    ),
  );
});

test("due date editor localizes its accessible label", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(
    <LocaleProvider locale="pt-BR">
      <DueDateEditor baby={baby} onUpdate={onUpdate} />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Editar" }));
  expect(view.getByLabelText("Data prevista")).toBeTruthy();
});

test("theme selector marks Baby Blue selected", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = renderResource(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change" }));

  const babyBlueButton = view.getByRole("button", { name: "Baby Blue" });
  expect(babyBlueButton.getAttribute("aria-pressed")).toBe("true");
  expect(view.getByRole("button", { name: "Default" }).getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(babyBlueButton);
  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ theme: BABY_BLUE_THEME }));
});

test("theme selector leaves canonical options unselected for an unknown theme", async () => {
  await using view = renderResource(
    <ThemeSelector
      baby={{ ...baby, theme: "not-a-real-theme" }}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change" }));

  expect(view.getByRole("button", { name: "Default" }).getAttribute("aria-pressed")).toBe("false");
});

test("theme selector reports a failed update and remains open", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockRejectedValue(new Error("Theme update failed"));
  await using view = renderResource(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change" }));
  fireEvent.click(view.getByRole("button", { name: "Bubblegum" }));

  await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Theme update failed"));
  expect(view.getByRole("button", { name: "Bubblegum" })).toBeTruthy();
});

test("status editor confirms destructive deletion", async () => {
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);
  const bornBaby = {
    ...baby,
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
    babyBorn: "2026-08-11T03:00:00.000Z",
  };
  await using view = renderResource(
    <StatusDateEditor
      baby={bornBaby}
      status="born"
      currentDate={bornBaby.babyBorn}
      onRedate={onRedate}
      onRemove={onRemove}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.click(view.getByRole("button", { name: "Delete" }));

  expect(view.getByRole("alertdialog")).toBeTruthy();
  expect(view.getByText(/deletes its timeline update/i)).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Delete status" }));

  await vi.waitFor(() => expect(onRemove).toHaveBeenCalledWith("born"));
});

test("status deletion is disabled until later statuses are deleted", async () => {
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);
  const bornBaby = {
    ...baby,
    wentToHospital: "2026-08-10T12:00:00.000Z",
    babyBorn: "2026-08-11T03:00:00.000Z",
  };
  await using view = renderResource(
    <TooltipProvider>
      <StatusDateEditor
        baby={bornBaby}
        status="gone_to_hospital"
        currentDate={bornBaby.wentToHospital}
        onRedate={onRedate}
        onRemove={onRemove}
      />
    </TooltipProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const deleteButton = view.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
  expect(deleteButton.disabled).toBe(true);

  const tooltipTrigger = deleteButton.closest('[data-slot="tooltip-trigger"]');
  if (!tooltipTrigger) throw new Error("Tooltip trigger missing");
  expect(tooltipTrigger.getAttribute("aria-label")).toBe("Delete the Born status first");
  expect(view.queryByRole("alertdialog")).toBeNull();
  expect(onRemove).not.toHaveBeenCalled();
});
