import { fireEvent, type RenderResult } from "@testing-library/react";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { SettingsPanel } from "@/components/baby/settings-panel";
import type { ComponentProps } from "react";
import { WithOverlayControl } from "@/test/overlayControl";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import type {
  BabyData,
  BabyUpdateHandler,
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
  dueDate: "2026-09-01T00:00:00.000Z",
  dueDateDisplayMode: "exact",
  laborStarted: "2026-08-10T08:00:00.000Z",
  milestoneVisibility: { showHospital: true, showLabor: true },
  name: "Nova",
  photoId: null,
  publicDueDateText: null,
  theme: null,
  timeZone: "Europe/London",
  wentToHospital: null,
};

const absentSettingsProps = {
  birthJourney: "labor" as const,
  coParents: null,
  messagePush: null,
  onDelete: null,
  onMilestoneRedate: () => undefined,
  onMilestoneRemove: () => undefined,
  profileLocale: "en-GB" as const,
};

type GuardedSettingsPanelProps = Omit<ComponentProps<typeof SettingsPanel>, "overlay"> & {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

/** `SettingsPanel` under a controlled form guard, the way its route mounts it. */
function GuardedSettingsPanel(props: GuardedSettingsPanelProps) {
  const { onOpenChange, open, ...panelProps } = props;
  return (
    <WithOverlayControl
      onOpenChange={onOpenChange}
      onOpenChangeComplete={() => undefined}
      open={open}
    >
      {(overlay) => <SettingsPanel {...panelProps} overlay={overlay} />}
    </WithOverlayControl>
  );
}

function openJourneyEditor(view: RenderResult) {
  fireEvent.click(view.getByRole("button", { name: "Edit journey" }));
}

/** Press the modal dialog's backdrop the way a real pointer would. */
function clickDialogBackdrop(view: RenderResult) {
  const backdrop = view.baseElement.querySelector("[data-slot=dialog-overlay]");
  if (!backdrop) {
    throw new Error("dialog backdrop missing");
  }
  fireEvent.pointerDown(backdrop, { pointerType: "mouse" });
  fireEvent.mouseDown(backdrop);
  fireEvent.mouseUp(backdrop);
  fireEvent.click(backdrop);
}

function selectJourneyPreset(view: RenderResult, label: string) {
  fireEvent.click(view.getByRole("combobox", { name: "Presets" }));
  const option = view.getByRole("option", { name: label });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

test("settings dialog shows page fields when open and stays closed when not", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using closed = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
      open={false}
      {...absentSettingsProps}
    />,
  );
  expect(closed.queryByRole("dialog")).toBeNull();
  expect(closed.queryByText("Settings")).toBeNull();

  await using open = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
      open={true}
      {...absentSettingsProps}
    />,
  );

  expect(open.getByRole("dialog")).toBeTruthy();
  expect(open.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(open.getByText("Baby name")).toBeTruthy();
  expect(open.getByText("Nova")).toBeTruthy();
  expect(open.getByText("Due date")).toBeTruthy();
  expect(
    open.getByText("1 September 2026 · Visitors see the exact date and countdown."),
  ).toBeTruthy();
  expect(open.getAllByText("Labour started").length).toBeGreaterThan(0);
  expect(open.getByText("Theme")).toBeTruthy();
  expect(open.getByRole("heading", { level: 3, name: "Page details" })).toBeTruthy();
  expect(open.getByRole("heading", { level: 3, name: "Birth journey" })).toBeTruthy();
  expect(open.getByRole("heading", { level: 3, name: "Appearance" })).toBeTruthy();
  expect(
    open.getByText("Visitors see: Labour started → Gone to hospital → Baby born"),
  ).toBeTruthy();
  expect(open.queryByRole("button", { name: "Labour" })).toBeNull();

  expect(open.queryByText("Delete page")).toBeNull();
  expect(open.queryByRole("switch", { name: "Message notifications" })).toBeNull();

  fireEvent.click(open.getByRole("button", { name: "Close" }));
  expect(onOpenChange).toHaveBeenCalled();
  expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
});

test("closing settings with a dirty nested editor prompts before discarding", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <GuardedSettingsPanel
        baby={baby}
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
        open
        {...absentSettingsProps}
      />
    </LocaleProvider>,
  );

  fireEvent.click(htmlButton(view.getAllByRole("button", { name: "Edit" })[0]));
  fireEvent.change(view.getByLabelText("Baby name"), { target: { value: "Draft name" } });
  fireEvent.click(view.getByRole("button", { name: "Close" }));

  expect(view.getByRole("alertdialog")).toBeTruthy();
  expect(view.getByText("Discard unsaved changes?")).toBeTruthy();
  expect(onOpenChange).not.toHaveBeenCalled();

  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("alertdialog")).toBeNull();
  });
  expect(htmlInput(view.getByLabelText("Baby name")).value).toBe("Draft name");

  fireEvent.click(view.getByRole("button", { name: "Close" }));
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  expect(onOpenChange.mock.calls.some((call) => call[0] === false)).toBe(true);
});

test("clicking the backdrop with a dirty nested editor shows one prompt for the whole stack", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <GuardedSettingsPanel
        baby={baby}
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
        open
        {...absentSettingsProps}
      />
    </LocaleProvider>,
  );

  fireEvent.click(htmlButton(view.getAllByRole("button", { name: "Edit" })[0]));
  fireEvent.change(view.getByLabelText("Baby name"), { target: { value: "Draft name" } });

  // The dialog backdrop press dismisses both the dialog (modal outside press)
  // and the nested popover (outside its popup); the stack must answer with a
  // single prompt rather than two stacked alert dialogs.
  clickDialogBackdrop(view);

  expect(view.getAllByText("Discard unsaved changes?").length).toBe(1);
  expect(onOpenChange).not.toHaveBeenCalled();

  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("alertdialog")).toBeNull();
  });
  expect(htmlInput(view.getByLabelText("Baby name")).value).toBe("Draft name");

  clickDialogBackdrop(view);
  fireEvent.click(view.getByRole("button", { name: "Discard" }));

  await vi.waitFor(() => {
    expect(onOpenChange.mock.calls.some((call) => call[0] === false)).toBe(true);
  });
  await vi.waitFor(() => {
    expect(view.queryByLabelText("Baby name")).toBeNull();
  });
});

test("due date row previews optional public text", async () => {
  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={{
        ...baby,
        dueDate: null,
        dueDateDisplayMode: "message",
        publicDueDateText: "Any day now",
      }}
      onOpenChange={vi.fn<(open: boolean) => void>()}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
      open
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Visitors see “Any day now”.")).toBeTruthy();
});

test("delete page control appears when onDelete is provided", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  const onDelete = vi.fn<() => void | Promise<void>>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      birthJourney="labor"
      coParents={null}
      messagePush={null}
      onDelete={onDelete}
      onMilestoneRedate={() => undefined}
      onMilestoneRemove={() => undefined}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
      open={true}
      profileLocale="en-GB"
    />,
  );

  expect(view.getByText("Delete page")).toBeTruthy();
  expect(view.getByRole("heading", { level: 3, name: "Danger zone" })).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Delete" }));
  expect(view.getByRole("heading", { name: "Delete Nova's page?" })).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Delete page" }));
  await vi.waitFor(() => {
    expect(onDelete).toHaveBeenCalled();
  });
});
test("falls back to the default label for an unknown legacy theme", async () => {
  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={{ ...baby, theme: "legacy-theme" }}
      onOpenChange={vi.fn<(open: boolean) => void>()}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
      open
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Mango")).toBeTruthy();
});

test("page language selection saves the locale override", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
      open
      {...absentSettingsProps}
    />,
  );

  const languageTrigger = view.getByRole("combobox", { name: "Language" });
  // Closed value matches the dropdown label, not the raw "inherit" sentinel
  expect(languageTrigger.textContent).toContain("Use my profile language (British English)");
  expect(languageTrigger.className).toMatch(/max-w-44/);

  fireEvent.click(languageTrigger);
  const swedish = view.getByRole("option", { name: "Swedish" });
  fireEvent.pointerDown(swedish, { pointerType: "mouse" });
  fireEvent.click(swedish);
  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ locale: "sv" });
  });

  fireEvent.click(view.getByRole("combobox", { name: "Language" }));
  const inherited = view.getByRole("option", {
    name: "Use my profile language (British English)",
  });
  fireEvent.pointerDown(inherited, { pointerType: "mouse" });
  fireEvent.click(inherited);
  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ locale: null });
  });
});

test("journey selection saves the chosen preset after Save", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
      open
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Journey")).toBeTruthy();
  openJourneyEditor(view);
  expect(view.getByRole("combobox", { name: "Presets" }).textContent).toContain("Labour");
  const saveButton = htmlButton(view.getByRole("button", { name: "Save" }));
  expect(saveButton.disabled).toBe(true);
  selectJourneyPreset(view, "Home birth");
  expect(onUpdate).not.toHaveBeenCalled();
  expect(saveButton.disabled).toBe(false);
  fireEvent.click(saveButton);
  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ birthJourney: "home_birth" });
  });
});

test("journey editor reports a failed save and remains open", async () => {
  await using toastError = spyOnToastErrorResource();
  const onUpdate = vi
    .fn<BabyUpdateHandler>()
    .mockRejectedValue(new Error("Could not save journey"));
  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      onOpenChange={vi.fn<(open: boolean) => void>()}
      onUpdate={onUpdate}
      open
      {...absentSettingsProps}
    />,
  );

  openJourneyEditor(view);
  selectJourneyPreset(view, "Home birth");
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("Could not save journey");
  });
  expect(view.getByRole("combobox", { name: "Presets" }).textContent).toContain("Home birth");
});

test("turning off visitor visibility does not remove a marked milestone", async () => {
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  const onMilestoneRemove = vi.fn<MilestoneRemoveHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={baby}
      onOpenChange={vi.fn<(open: boolean) => void>()}
      onUpdate={onUpdate}
      open
      {...absentSettingsProps}
      onMilestoneRemove={onMilestoneRemove}
    />,
  );

  openJourneyEditor(view);

  fireEvent.click(view.getByRole("switch", { name: "Labour started" }));
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ birthJourney: "planned_c_section" });
  });
  expect(onMilestoneRemove).not.toHaveBeenCalled();
  expect(view.queryByRole("heading", { name: "Remove marked milestones?" })).toBeNull();
});

test("journey selection stays changeable after milestone updates", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <GuardedSettingsPanel
      baby={{ ...baby, laborStarted: null, wentToHospital: "2026-08-10T12:00:00.000Z" }}
      onOpenChange={onOpenChange}
      onUpdate={onUpdate}
      open
      {...absentSettingsProps}
      birthJourney="home_birth"
    />,
  );

  expect(view.getAllByText("Gone to hospital").length).toBeGreaterThan(0);
  openJourneyEditor(view);
  expect(view.getByRole("combobox", { name: "Presets" }).textContent).toContain("Home birth");
  selectJourneyPreset(view, "Planned C-section");
  fireEvent.click(view.getByRole("button", { name: "Save" }));
  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ birthJourney: "planned_c_section" });
  });
});

test("theme constants render through the active translation catalog", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="sv">
      <GuardedSettingsPanel
        baby={baby}
        birthJourney="labor"
        coParents={null}
        messagePush={null}
        onDelete={null}
        onMilestoneRedate={() => undefined}
        onMilestoneRemove={() => undefined}
        onOpenChange={onOpenChange}
        onUpdate={onUpdate}
        open
        profileLocale="sv"
      />
    </LocaleProvider>,
  );

  expect(view.getByText("Tema")).toBeTruthy();
  expect(view.getAllByText("Mango").length).toBeGreaterThan(0);
  expect(view.getByText("Resa")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Redigera resa" }));
  expect(view.getByRole("combobox", { name: "Förval" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Spara" })).toBeTruthy();
});
