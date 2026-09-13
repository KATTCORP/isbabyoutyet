import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { ProgressIndicator } from "@/components/baby/progress-indicator";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import type { BabyData } from "@baby-outlet/backend/src/types";
import { getCurrentStatus } from "@baby-outlet/backend/src/types";

function useFakeTimersResource(now: Date) {
  vi.useFakeTimers({ now });
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

function renderResource(ui: ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

const waitingBaby: BabyData = {
  name: "Baby Smith",
  dueDate: "2026-09-01",
  dueDateDisplayMode: "exact",
  publicDueDateText: null,
  laborStarted: null,
  wentToHospital: null,
  babyBorn: null,
};

const bornBaby: BabyData = {
  ...waitingBaby,
  laborStarted: "2026-08-11T03:00:00.000Z",
  wentToHospital: "2026-08-11T08:00:00.000Z",
  babyBorn: "2026-08-11T10:00:00.000Z",
};

test("shows all three milestones without dates while waiting", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  await using view = renderResource(
    <ProgressIndicator baby={waitingBaby} currentStatus={getCurrentStatus(waitingBaby)} />,
  );

  expect(view.getByText("Labour started")).toBeTruthy();
  expect(view.getByText("Gone to hospital")).toBeTruthy();
  expect(view.getByText("Baby born")).toBeTruthy();
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  expect(view.queryByText("yesterday")).toBeNull();
});

test("marks every stage complete with its relative time once born", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  await using view = renderResource(
    <ProgressIndicator baby={bornBaby} currentStatus={getCurrentStatus(bornBaby)} />,
  );

  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  // Each completed milestone shows when it happened
  expect(view.getAllByText("yesterday")).toHaveLength(3);
});

const atHospitalBaby: BabyData = {
  ...waitingBaby,
  laborStarted: "2026-08-11T03:00:00.000Z",
  wentToHospital: "2026-08-11T08:00:00.000Z",
  babyBorn: null,
};

test("fills only the path into reached milestones while still in hospital", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  await using view = renderResource(
    <ProgressIndicator baby={atHospitalBaby} currentStatus={getCurrentStatus(atHospitalBaby)} />,
  );

  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("67");
  // Two completed milestones get relative times; the unreached one does not.
  expect(view.getAllByText("yesterday")).toHaveLength(2);
  expect(view.getByText("Baby born")).toBeTruthy();
});

test("recalculates progress when labour is hidden", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  const hospitalPage: BabyData = {
    ...waitingBaby,
    milestoneVisibility: { showLabor: false, showHospital: true },
    wentToHospital: "2026-08-11T08:00:00.000Z",
  };
  await using view = renderResource(
    <ProgressIndicator baby={hospitalPage} currentStatus={getCurrentStatus(hospitalPage)} />,
  );

  expect(view.queryByText("Labour started")).toBeNull();
  expect(view.getByText("Gone to hospital")).toBeTruthy();
  expect(view.getByText("Baby born")).toBeTruthy();
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
});

test("recalculates progress when hospital is hidden", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-12T12:00:00.000Z"));
  const labourPage: BabyData = {
    ...waitingBaby,
    milestoneVisibility: { showLabor: true, showHospital: false },
    laborStarted: "2026-08-11T08:00:00.000Z",
  };
  await using view = renderResource(
    <ProgressIndicator baby={labourPage} currentStatus={getCurrentStatus(labourPage)} />,
  );

  expect(view.getByText("Labour started")).toBeTruthy();
  expect(view.queryByText("Gone to hospital")).toBeNull();
  expect(view.getByText("Baby born")).toBeTruthy();
  expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
});
