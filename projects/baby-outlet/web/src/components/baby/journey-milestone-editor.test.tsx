import { fireEvent, type RenderResult } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { BirthJourney } from "@baby-outlet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";
import { JourneyMilestoneEditor } from "./journey-milestone-editor";
import { renderResource } from "@/test/renderResource";

function renderEditor(opts: {
  birthJourney: BirthJourney;
  onBirthJourneyChange: (birthJourney: BirthJourney) => void;
}) {
  return renderResource(
    <LocaleProvider locale="en-GB">
      <JourneyMilestoneEditor
        birthJourney={opts.birthJourney}
        idPrefix="test-journey"
        onBirthJourneyChange={opts.onBirthJourneyChange}
      />
    </LocaleProvider>,
  );
}

function selectPreset(view: RenderResult, label: string) {
  fireEvent.click(view.getByRole("combobox", { name: "Presets" }));
  const option = view.getByRole("option", { name: label });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

test("shows Custom in the preset select when both pre-birth milestones are hidden", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "custom",
    onBirthJourneyChange,
  });

  expect(view.getByRole("combobox", { name: "Presets" }).textContent).toContain("Custom");
  expect(view.getByText("Visitors see: Baby born")).toBeTruthy();
});

test("applies toggle changes immediately to the caller", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "labor",
    onBirthJourneyChange,
  });

  fireEvent.click(view.getByRole("switch", { name: "Labour started" }));

  expect(onBirthJourneyChange).toHaveBeenCalledWith("planned_c_section");
});

test("hides marked milestones from visitors without deleting them", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "labor",
    onBirthJourneyChange,
  });

  fireEvent.click(view.getByRole("switch", { name: "Labour started" }));

  expect(onBirthJourneyChange).toHaveBeenCalledWith("planned_c_section");
  expect(view.queryByRole("heading", { name: "Remove marked milestones?" })).toBeNull();
});

test("applies hospital visibility toggle", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "labor",
    onBirthJourneyChange,
  });

  fireEvent.click(view.getByRole("switch", { name: "Gone to hospital" }));

  expect(onBirthJourneyChange).toHaveBeenCalledWith("home_birth");
});

test("selecting a preset notifies the caller", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "labor",
    onBirthJourneyChange,
  });

  selectPreset(view, "Home birth");

  expect(onBirthJourneyChange).toHaveBeenCalledWith("home_birth");
});

test("selecting the current preset is a no-op", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "labor",
    onBirthJourneyChange,
  });

  selectPreset(view, "Labour");

  expect(onBirthJourneyChange).not.toHaveBeenCalled();
});

test("leaving custom via a preset notifies the caller", async () => {
  const onBirthJourneyChange = vi.fn<(birthJourney: BirthJourney) => void>();

  await using view = renderEditor({
    birthJourney: "custom",
    onBirthJourneyChange,
  });

  selectPreset(view, "Labour");

  expect(onBirthJourneyChange).toHaveBeenCalledWith("labor");
});
