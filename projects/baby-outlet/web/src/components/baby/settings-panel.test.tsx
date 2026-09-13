import { fireEvent, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SettingsPanel } from "@/components/baby/settings-panel";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import type { BabyData, BabyUpdateHandler } from "@baby-outlet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn<(message: string) => void>(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

const baby: BabyData = {
  name: "Nova",
  dueDate: "2026-09-01T00:00:00.000Z",
  dueDateDisplayMode: "exact",
  publicDueDateText: null,
  theme: null,
  laborStarted: "2026-08-10T08:00:00.000Z",
  wentToHospital: null,
  babyBorn: null,
  encouragementsDisabled: false,
  photoId: null,
  milestoneVisibility: { showLabor: true, showHospital: true },
};

const absentSettingsProps = {
  birthJourney: "labor" as const,
  profileLocale: "en-GB" as const,
  onDelete: null,
  coParents: null,
  onMilestoneRedate: () => undefined,
  onMilestoneRemove: () => undefined,
};

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("settings dialog shows page fields when open and stays closed when not", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using closed = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      open={false}
      onOpenChange={onOpenChange}
      {...absentSettingsProps}
    />,
  );
  expect(closed.queryByRole("dialog")).toBeNull();
  expect(closed.queryByText("Settings")).toBeNull();

  await using open = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      open={true}
      onOpenChange={onOpenChange}
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
  expect(open.getByText("Labour started")).toBeTruthy();
  expect(open.getByText("Theme")).toBeTruthy();
  expect(open.getByText("Messages")).toBeTruthy();
  expect(open.getByText("Visitors can send messages")).toBeTruthy();
  expect(open.queryByText("Delete page")).toBeNull();

  fireEvent.click(open.getByRole("button", { name: "Close" }));
  expect(onOpenChange).toHaveBeenCalled();
  expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
});

test("due date row previews optional public text", async () => {
  await using view = renderResource(
    <SettingsPanel
      baby={{
        ...baby,
        dueDate: null,
        dueDateDisplayMode: "message",
        publicDueDateText: "Any day now",
      }}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Visitors see “Any day now”.")).toBeTruthy();
});

test("delete page control appears when onDelete is provided", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);
  const onDelete = vi.fn<() => void | Promise<void>>().mockResolvedValue(undefined);

  await using view = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      onDelete={onDelete}
      birthJourney="labor"
      open={true}
      onOpenChange={onOpenChange}
      profileLocale="en-GB"
      coParents={null}
      onMilestoneRedate={() => undefined}
      onMilestoneRemove={() => undefined}
    />,
  );

  expect(view.getByText("Delete page")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Delete" }));
  expect(view.getByRole("heading", { name: "Delete Nova's page?" })).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Delete page" }));
  expect(onDelete).toHaveBeenCalled();
});
test("encouragements switch toggles the disabled flag via onUpdate", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      open={true}
      onOpenChange={onOpenChange}
      {...absentSettingsProps}
    />,
  );

  fireEvent.click(view.getByRole("switch", { name: "Messages" }));
  expect(onUpdate).toHaveBeenCalledWith({ encouragementsDisabled: true });
});

test("shows when visitor messages are disabled", async () => {
  await using view = renderResource(
    <SettingsPanel
      baby={{ ...baby, encouragementsDisabled: true }}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Form disabled")).toBeTruthy();
});

test("falls back to the default label for an unknown legacy theme", async () => {
  await using view = renderResource(
    <SettingsPanel
      baby={{ ...baby, theme: "legacy-theme" }}
      onUpdate={vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined)}
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Default")).toBeTruthy();
});

test("page language selection saves the locale override", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      open
      onOpenChange={onOpenChange}
      {...absentSettingsProps}
    />,
  );

  fireEvent.click(view.getByRole("combobox", { name: "Language" }));
  const swedish = view.getByRole("option", { name: "Swedish" });
  fireEvent.pointerDown(swedish, { pointerType: "mouse" });
  fireEvent.click(swedish);
  expect(onUpdate).toHaveBeenCalledWith({ locale: "sv" });

  fireEvent.click(view.getByRole("combobox", { name: "Language" }));
  const inherited = view.getByRole("option", {
    name: "Use my profile language (British English)",
  });
  fireEvent.pointerDown(inherited, { pointerType: "mouse" });
  fireEvent.click(inherited);
  expect(onUpdate).toHaveBeenCalledWith({ locale: null });
});

test("journey selection saves the chosen option", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      open
      onOpenChange={onOpenChange}
      {...absentSettingsProps}
    />,
  );

  expect(view.getByText("Journey")).toBeTruthy();
  expect(view.getByText("Labour")).toBeTruthy();
  expect(view.queryByRole("radio", { name: "Home birth" })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Edit journey" }));
  expect(view.getByRole("radio", { name: "Labour" })).toBeTruthy();
  fireEvent.click(view.getByRole("radio", { name: "Home birth" }));
  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ birthJourney: "home_birth" });
  });
  await vi.waitFor(() => {
    expect(view.queryByRole("radio", { name: "Home birth" })).toBeNull();
  });
});

test("journey editor reports a failed save and remains open", async () => {
  mocks.toastError.mockReset();
  const onUpdate = vi
    .fn<BabyUpdateHandler>()
    .mockRejectedValue(new Error("Could not save journey"));
  await using view = renderResource(
    <SettingsPanel
      baby={baby}
      onUpdate={onUpdate}
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      {...absentSettingsProps}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Edit journey" }));
  fireEvent.click(view.getByRole("radio", { name: "Home birth" }));

  await vi.waitFor(() => {
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save journey");
  });
  expect(view.getByRole("radio", { name: "Home birth" })).toBeTruthy();
});

test("journey selection stays changeable after milestone updates", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = renderResource(
    <SettingsPanel
      baby={{ ...baby, wentToHospital: "2026-08-10T12:00:00.000Z" }}
      onUpdate={onUpdate}
      open
      onOpenChange={onOpenChange}
      {...absentSettingsProps}
      birthJourney="home_birth"
    />,
  );

  expect(view.getByText("Gone to hospital")).toBeTruthy();
  expect(view.getByText("Home birth")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Edit journey" }));
  fireEvent.click(view.getByRole("radio", { name: "Planned C-section" }));
  await vi.waitFor(() => {
    expect(onUpdate).toHaveBeenCalledWith({ birthJourney: "planned_c_section" });
  });
});

test("theme constants render through the active translation catalog", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onUpdate = vi.fn<BabyUpdateHandler>().mockResolvedValue(undefined);

  await using view = renderResource(
    <LocaleProvider locale="sv">
      <SettingsPanel
        baby={baby}
        birthJourney="labor"
        onUpdate={onUpdate}
        open
        onOpenChange={onOpenChange}
        profileLocale="sv"
        onDelete={null}
        coParents={null}
        onMilestoneRedate={() => undefined}
        onMilestoneRemove={() => undefined}
      />
    </LocaleProvider>,
  );

  expect(view.getByText("Tema")).toBeTruthy();
  expect(view.getByText("Standard")).toBeTruthy();
  expect(view.getByText("Resa")).toBeTruthy();
  expect(view.getByText("Förlossning")).toBeTruthy();
});
