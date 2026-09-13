import { fireEvent, within } from "@testing-library/react";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import {
  DueDateEditor,
  JourneyEditor,
  NameEditor,
  StatusDateEditor,
  ThemeSelector,
} from "@/components/baby/editors";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { BABY_BLUE_THEME } from "@isbabyoutyet/backend/src/theme";
import type {
  BabyData,
  BabyUpdateHandler,
  MilestoneRedateHandler,
  MilestoneRemoveHandler,
} from "@isbabyoutyet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";
import { htmlButton, htmlInput } from "@/test/htmlElement";

function spyOnToastErrorResource() {
  const toastError = vi.spyOn(toast, "error").mockReturnValue("toast-id");
  return makeResource(toastError, () => {
    toastError.mockRestore();
  });
}

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

test("name editor mounts fresh on open: current name, reassurance note, trimmed save", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(<NameEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));

  // The form mounted with the current name and the link reassurance
  const input = htmlInput(view.getByLabelText("Baby name"));
  expect(input.value).toBe("Nova");
  expect(view.getByText(/links you have already shared will keep working/i)).toBeTruthy();

  // Save is dirty-gated until the name changes
  const saveButton = htmlButton(view.getByRole("button", { name: "Save" }));
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
  await using view = await renderWithTestRouter(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const input = htmlInput(view.getByLabelText("Due date"));
  expect(input.value).toBe("2026-09-01");
  expect(
    view.getAllByText("Due date").filter((element) => !element.classList.contains("sr-only")),
  ).toHaveLength(1);
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

test("due date editor requires a date in exact mode", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.change(htmlInput(view.getByLabelText("Due date")), { target: { value: "" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => expect(view.getByText("Pick a date")).toBeTruthy());
  expect(onUpdate).not.toHaveBeenCalled();
});

test("due date editor saves message mode without public text", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.click(view.getByRole("switch", { name: "Show exact due date" }));
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await vi.waitFor(() =>
    expect(onUpdate).toHaveBeenCalledWith({
      dueDate: "2026-09-01T00:00:00.000Z",
      dueDateDisplayMode: "message",
      publicDueDateText: null,
    }),
  );
});

test("due date editor saves a custom visitor message when provided", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.click(view.getByRole("switch", { name: "Show exact due date" }));
  const publicMessageInput = htmlInput(view.getByLabelText("Public due date message"));
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

test("due date editor toggles exact mode when clicking the row label", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(<DueDateEditor baby={baby} onUpdate={onUpdate} />);

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const exactSwitch = view.getByRole("switch", { name: "Show exact due date" });
  expect(exactSwitch.getAttribute("aria-checked")).toBe("true");

  fireEvent.click(view.getByText("Visitors see the exact date and countdown."));
  expect(exactSwitch.getAttribute("aria-checked")).toBe("false");

  fireEvent.click(view.getByText("Show exact due date"));
  expect(exactSwitch.getAttribute("aria-checked")).toBe("true");
});

test("due date editor toggles modes without losing either field value", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(
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
  expect(htmlInput(view.getByLabelText("Public due date message")).value).toBe("Any day now");
  fireEvent.click(exactSwitch);
  expect(view.queryByLabelText("Public due date message")).toBeNull();
  expect(htmlInput(view.getByLabelText("Due date")).value).toBe("2026-09-01");
  fireEvent.click(exactSwitch);
  expect(htmlInput(view.getByLabelText("Public due date message")).value).toBe("Any day now");
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
  await using view = await renderWithTestRouter(<NameEditor baby={baby} onUpdate={onUpdate} />);

  // Open, type a draft, then cancel — the draft must not survive
  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.change(view.getByLabelText("Baby name"), { target: { value: "Scrapped draft" } });
  fireEvent.click(view.getByRole("button", { name: "Cancel" }));
  expect(view.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  await vi.waitFor(() => expect(view.queryByLabelText("Baby name")).toBeNull());

  // The name changes from outside (e.g. the mutation round-trip)
  view.rerender(<NameEditor baby={{ ...baby, name: "Nova Rae" }} onUpdate={onUpdate} />);

  // Reopening mounts a fresh form seeded with the latest name
  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const input = htmlInput(view.getByLabelText("Baby name"));
  expect(input.value).toBe("Nova Rae");
});

test("status editor saves the matching milestone instant", async () => {
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);
  const laborBaby = { ...baby, laborStarted: "2026-08-10T08:00:00.000Z" };
  await using view = await renderWithTestRouter(
    <StatusDateEditor
      baby={laborBaby}
      currentDate={laborBaby.laborStarted}
      onRedate={onRedate}
      onRemove={onRemove}
      status="labor_started"
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.change(view.getByLabelText("Status date and time"), {
    target: { value: "2026-08-10T09:30" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() =>
    expect(onRedate).toHaveBeenCalledWith("labor_started", "2026-08-10T08:30:00.000Z"),
  );
});

test("due date editor localizes its accessible label", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="pt-BR">
      <DueDateEditor baby={baby} onUpdate={onUpdate} />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Editar" }));
  expect(view.getByLabelText("Data prevista")).toBeTruthy();
});

test("theme selector marks Baby Blue selected", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  // Closed trigger shows the selected theme the same way open options do
  expect(view.getByRole("button", { name: "Change theme" }).textContent).toContain("Baby Blue");

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));

  const babyBlueButton = view.getByRole("button", { name: "Baby Blue" });
  expect(babyBlueButton.getAttribute("aria-pressed")).toBe("true");
  expect(view.getByRole("button", { name: "Mango" }).getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(babyBlueButton);
  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ theme: BABY_BLUE_THEME }));
});

test("theme selector marks Mango selected for the default theme", async () => {
  await using view = await renderWithTestRouter(
    <ThemeSelector
      baby={{ ...baby, theme: null }}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
    />,
  );

  expect(view.getByRole("button", { name: "Change theme" }).textContent).toContain("Mango");

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));

  expect(view.getByRole("button", { name: "Mango" }).getAttribute("aria-pressed")).toBe("true");
  expect(view.getByRole("button", { name: "Baby Blue" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
});

test("theme selector shows a trailing spinner only on the option being applied", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseUpdate: (() => void) | undefined;
  const onUpdate = vi.fn<BabyUpdateHandler>(async () => {
    await new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
  });

  await using view = await renderWithTestRouter(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));

  const bubblegum = view.getByRole("button", { name: "Bubblegum" });
  const mango = view.getByRole("button", { name: "Mango" });
  const babyBlue = view.getByRole("button", { name: "Baby Blue" });

  fireEvent.click(bubblegum);
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(bubblegum.getAttribute("aria-busy")).toBe("true");
  });
  expect(within(bubblegum).getByRole("status", { name: "Loading" })).toBeTruthy();
  expect(within(mango).queryByRole("status", { name: "Loading" })).toBeNull();
  expect(within(babyBlue).queryByRole("status", { name: "Loading" })).toBeNull();
  expect(mango.getAttribute("aria-busy")).toBe("false");
  expect(babyBlue.getAttribute("aria-busy")).toBe("false");
  expect(view.getAllByRole("status", { name: "Loading" })).toHaveLength(1);

  releaseUpdate?.();
  await vi.advanceTimersByTimeAsync(0);

  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ theme: "bubblegum" }));
});

test("theme selector shows a trailing spinner on Mango when applying the default theme", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseUpdate: (() => void) | undefined;
  const onUpdate = vi.fn<BabyUpdateHandler>(async () => {
    await new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
  });

  await using view = await renderWithTestRouter(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));

  const mango = view.getByRole("button", { name: "Mango" });
  const babyBlue = view.getByRole("button", { name: "Baby Blue" });

  fireEvent.click(mango);
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(mango.getAttribute("aria-busy")).toBe("true");
  });
  expect(within(mango).getByRole("status", { name: "Loading" })).toBeTruthy();
  expect(within(babyBlue).queryByRole("status", { name: "Loading" })).toBeNull();
  expect(view.getAllByRole("status", { name: "Loading" })).toHaveLength(1);

  releaseUpdate?.();
  await vi.advanceTimersByTimeAsync(0);

  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ theme: null }));
});

test("theme selector leaves canonical options unselected for an unknown theme", async () => {
  await using view = await renderWithTestRouter(
    <ThemeSelector
      baby={{ ...baby, theme: "not-a-real-theme" }}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
    />,
  );

  expect(view.getByRole("button", { name: "Change theme" }).textContent).toContain("Change");

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));

  expect(view.getByRole("button", { name: "Mango" }).getAttribute("aria-pressed")).toBe("false");
});

test("theme selector reports a failed update and remains open", async () => {
  await using toastError = spyOnToastErrorResource();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockRejectedValue(new Error("Theme update failed"));
  await using view = await renderWithTestRouter(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));
  fireEvent.click(view.getByRole("button", { name: "Bubblegum" }));

  await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("Theme update failed"));
  await vi.waitFor(() => {
    expect(view.getByRole("button", { name: "Bubblegum" })).toBeTruthy();
  });
});

test("theme selector toasts a generic message for non-Error failures", async () => {
  await using toastError = spyOnToastErrorResource();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockRejectedValue("nope");
  await using view = await renderWithTestRouter(
    <ThemeSelector baby={{ ...baby, theme: BABY_BLUE_THEME }} onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Change theme" }));
  fireEvent.click(view.getByRole("button", { name: "Bubblegum" }));

  await vi.waitFor(() =>
    expect(toastError).toHaveBeenCalledWith("Something went wrong. Try again."),
  );
});

test("journey editor saves only when dirty", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  await using view = await renderWithTestRouter(
    <JourneyEditor birthJourney="labor" onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit journey" }));
  const saveButton = htmlButton(view.getByRole("button", { name: "Save" }));
  expect(saveButton.disabled).toBe(true);

  fireEvent.click(view.getByRole("combobox", { name: "Presets" }));
  const homeBirth = view.getByRole("option", { name: "Home birth" });
  fireEvent.pointerDown(homeBirth, { pointerType: "mouse" });
  fireEvent.click(homeBirth);
  expect(saveButton.disabled).toBe(false);
  expect(onUpdate).not.toHaveBeenCalled();

  fireEvent.click(saveButton);
  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ birthJourney: "home_birth" }));
  await vi.waitFor(() => expect(view.queryByRole("combobox", { name: "Presets" })).toBeNull());
});

test("journey editor reports a failed save and remains open", async () => {
  await using toastError = spyOnToastErrorResource();
  const onUpdate = vi
    .fn<BabyUpdateHandler>()
    .mockRejectedValue(new Error("Could not save journey"));
  await using view = await renderWithTestRouter(
    <JourneyEditor birthJourney="labor" onUpdate={onUpdate} />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit journey" }));
  fireEvent.click(view.getByRole("combobox", { name: "Presets" }));
  const homeBirth = view.getByRole("option", { name: "Home birth" });
  fireEvent.pointerDown(homeBirth, { pointerType: "mouse" });
  fireEvent.click(homeBirth);
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("Could not save journey");
  });
  expect(view.getByRole("combobox", { name: "Presets" }).textContent).toContain("Home birth");
});

test("status editor confirms destructive deletion", async () => {
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);
  const bornBaby = {
    ...baby,
    babyBorn: "2026-08-11T03:00:00.000Z",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
  };
  await using view = await renderWithTestRouter(
    <StatusDateEditor
      baby={bornBaby}
      currentDate={bornBaby.babyBorn}
      onRedate={onRedate}
      onRemove={onRemove}
      status="born"
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.click(view.getByRole("button", { name: "Delete" }));

  expect(view.getByRole("alertdialog")).toBeTruthy();
  expect(view.getByText(/deletes its timeline update/i)).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Delete status" }));

  await vi.waitFor(() => expect(onRemove).toHaveBeenCalledWith("born"));
});

test("status delete dialog stays open while deletion is pending", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseRemove: (() => void) | undefined;
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>(async () => {
    await new Promise<void>((resolve) => {
      releaseRemove = resolve;
    });
  });
  const bornBaby = {
    ...baby,
    babyBorn: "2026-08-11T03:00:00.000Z",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
  };
  await using view = await renderWithTestRouter(
    <StatusDateEditor
      baby={bornBaby}
      currentDate={bornBaby.babyBorn}
      onRedate={onRedate}
      onRemove={onRemove}
      status="born"
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  fireEvent.click(view.getByRole("button", { name: "Delete" }));
  fireEvent.click(view.getByRole("button", { name: "Delete status" }));
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(
      htmlButton(view.getByRole("button", { name: "Delete status" })).getAttribute("aria-busy"),
    ).toBe("true");
  });

  fireEvent.keyDown(view.getByRole("alertdialog"), { key: "Escape" });
  expect(view.getByRole("alertdialog")).toBeTruthy();

  releaseRemove?.();
  await vi.advanceTimersByTimeAsync(0);
  await vi.waitFor(() => expect(onRemove).toHaveBeenCalledWith("born"));
});

test("status deletion is disabled until later statuses are deleted", async () => {
  const onRedate = vi.fn<MilestoneRedateHandler>().mockResolvedValue(undefined);
  const onRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);
  const bornBaby = {
    ...baby,
    babyBorn: "2026-08-11T03:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
  };
  await using view = await renderWithTestRouter(
    <TooltipProvider>
      <StatusDateEditor
        baby={bornBaby}
        currentDate={bornBaby.wentToHospital}
        onRedate={onRedate}
        onRemove={onRemove}
        status="gone_to_hospital"
      />
    </TooltipProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit" }));
  const deleteButton = htmlButton(view.getByRole("button", { name: "Delete" }));
  expect(deleteButton.disabled).toBe(true);

  const tooltipTrigger = deleteButton.closest('[data-slot="tooltip-trigger"]');
  if (!tooltipTrigger) {
    throw new Error("Tooltip trigger missing");
  }
  expect(tooltipTrigger.getAttribute("aria-label")).toBe("Delete the Born status first");
  expect(view.queryByRole("alertdialog")).toBeNull();
  expect(onRemove).not.toHaveBeenCalled();
});
