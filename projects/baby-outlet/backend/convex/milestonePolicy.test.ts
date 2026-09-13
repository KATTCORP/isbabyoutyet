import { expect, test } from "vitest";
import { getMilestonePolicy, milestoneVisibilityForPreset } from "../src/types";

test("saved journey selections derive their available milestones", () => {
  expect(milestoneVisibilityForPreset("labor")).toEqual({
    showLabor: true,
    showHospital: true,
  });
  expect(milestoneVisibilityForPreset("home_birth")).toEqual({
    showLabor: true,
    showHospital: false,
  });
  expect(milestoneVisibilityForPreset("planned_c_section")).toEqual({
    showLabor: false,
    showHospital: true,
  });
});

test("labour selection includes every milestone", () => {
  const policy = getMilestonePolicy({
    birthJourney: "labor",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null,
    babyBorn: null,
  });

  expect(policy.visibility).toEqual({ showLabor: true, showHospital: true });
  expect(policy.visibleMilestones).toEqual(["labor_started", "gone_to_hospital", "born"]);
  expect(policy.currentStatus.type).toBe("labor_started");
  expect(Math.round(policy.progressPercent)).toBe(33);
});

test("planned C-section derives hospital and birth as available milestones", () => {
  const policy = getMilestonePolicy({
    birthJourney: "planned_c_section",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null,
    babyBorn: null,
  });

  expect(policy.visibleMilestones).toEqual(["gone_to_hospital", "born"]);
  expect(policy.currentStatus.type).toBe("not_yet");
  expect(policy.canMark("labor_started")).toBe(false);
  expect(policy.canMark("gone_to_hospital")).toBe(true);
  expect(policy.canMark("born")).toBe(true);
  expect(policy.progressPercent).toBe(0);
});

test("home birth keeps hospital data out of the derived current status", () => {
  const policy = getMilestonePolicy({
    birthJourney: "home_birth",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
    babyBorn: null,
  });

  expect(policy.currentStatus.type).toBe("labor_started");
  expect(policy.progressPercent).toBe(50);
});

test("public projections and defensive legacy inputs use neutral visibility", () => {
  expect(
    getMilestonePolicy({
      milestoneVisibility: { showLabor: false, showHospital: false },
    }).visibleMilestones,
  ).toEqual(["born"]);
  expect(getMilestonePolicy({}).visibility).toEqual({
    showLabor: true,
    showHospital: true,
  });
});
