import { expect, test } from "vitest";
import {
  getMilestonePolicy,
  milestoneVisibilityForPreset,
  birthJourneyForVisibility,
} from "../src/types";

test("saved journey selections derive their available milestones", () => {
  expect(milestoneVisibilityForPreset("labor")).toEqual({
    showHospital: true,
    showLabor: true,
  });
  expect(milestoneVisibilityForPreset("home_birth")).toEqual({
    showHospital: false,
    showLabor: true,
  });
  expect(milestoneVisibilityForPreset("planned_c_section")).toEqual({
    showHospital: true,
    showLabor: false,
  });
  expect(milestoneVisibilityForPreset("custom")).toEqual({
    showHospital: false,
    showLabor: false,
  });
  expect(birthJourneyForVisibility({ showHospital: true, showLabor: true })).toBe("labor");
  expect(birthJourneyForVisibility({ showHospital: false, showLabor: false })).toBe("custom");
});

test("labour selection includes every milestone", () => {
  const policy = getMilestonePolicy({
    babyBorn: null,
    birthJourney: "labor",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null,
  });

  expect(policy.visibility).toEqual({ showHospital: true, showLabor: true });
  expect(policy.visibleMilestones).toEqual(["labor_started", "gone_to_hospital", "born"]);
  expect(policy.currentStatus.type).toBe("labor_started");
  expect(Math.round(policy.progressPercent)).toBe(33);
});

test("planned C-section derives hospital and birth as available milestones", () => {
  const policy = getMilestonePolicy({
    babyBorn: null,
    birthJourney: "planned_c_section",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null,
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
    babyBorn: null,
    birthJourney: "home_birth",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: "2026-08-10T12:00:00.000Z",
  });

  expect(policy.currentStatus.type).toBe("labor_started");
  expect(policy.progressPercent).toBe(50);
});

test("public projections and defensive legacy inputs use neutral visibility", () => {
  expect(
    getMilestonePolicy({
      milestoneVisibility: { showHospital: false, showLabor: false },
    }).visibleMilestones,
  ).toEqual(["born"]);
  expect(getMilestonePolicy({}).visibility).toEqual({
    showHospital: true,
    showLabor: true,
  });
});
