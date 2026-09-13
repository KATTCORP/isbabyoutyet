import type { Doc } from "../convex/_generated/dataModel";

export const BIRTH_JOURNEYS = ["labor", "home_birth", "planned_c_section", "custom"] as const;

export type BirthJourney = (typeof BIRTH_JOURNEYS)[number];

export const PRESET_BIRTH_JOURNEYS = ["labor", "home_birth", "planned_c_section"] as const;

export type PresetBirthJourney = (typeof PRESET_BIRTH_JOURNEYS)[number];

/**
 * Sentinel returned by manager-only queries when the caller lacks access,
 * instead of throwing. Lets route loaders fetch the same set of queries for
 * every visitor; read sites narrow it away.
 */
export const FORBIDDEN = "forbidden" as const;

/**
 * Event-clock dates for the three milestones. On the server these are inferred
 * from the latest active milestone updates; the preview page supplies them as
 * query params.
 */
export type MilestoneDates = {
  babyBorn: string | null;
  laborStarted: string | null;
  wentToHospital: string | null;
};

/**
 * Preview-only per-stage messages. Live pages keep copy on timeline updates;
 * the homepage preview still passes these as query params.
 */
export type BabyPreviewMessages = {
  babyBornMessage: string | null;
  hospitalMessage: string | null;
  laborStartedMessage: string | null;
};

/**
 * Core baby data shape used by both the real page (from Convex) and preview (from query params)
 */
export type BabyData = Omit<
  Doc<"baby">,
  | "userId"
  | "ownerTokenIdentifier"
  | "lastActivityAt"
  | "subscriptionCount"
  | "publicId"
  | "_id"
  | "_creationTime"
  | "birthJourney"
> & {
  /** IANA time zone inherited from the owning profile. */
  timeZone: string;
} & MilestoneDates &
  Partial<{ milestoneVisibility: MilestoneVisibility }>;

export type PreviewBabyData = BabyData & BabyPreviewMessages;

/**
 * Partial update to baby data - used by editors
 */
export type BabyUpdate = Partial<
  Pick<
    BabyData,
    "name" | "dueDate" | "dueDateDisplayMode" | "publicDueDateText" | "theme" | "locale"
  > & {
    birthJourney: BirthJourney;
  }
>;

/**
 * Handler for updating baby data - abstracts mutations vs query param updates
 */
export type BabyUpdateHandler = (update: BabyUpdate) => void | Promise<void>;

export type Milestone = "labor_started" | "gone_to_hospital" | "born";

export type MilestoneRedateHandler = (
  milestone: Milestone,
  occurredAt: string,
) => void | Promise<void>;

export type MilestoneRemoveHandler = (milestone: Milestone) => void | Promise<void>;

export type MilestoneVisibility = {
  showHospital: boolean;
  showLabor: boolean;
};

export const DEFAULT_MILESTONE_VISIBILITY = {
  showHospital: true,
  showLabor: true,
} as const satisfies MilestoneVisibility;

export const MILESTONE_VISIBILITY_PRESETS = {
  custom: { showHospital: false, showLabor: false },
  home_birth: { showHospital: false, showLabor: true },
  labor: DEFAULT_MILESTONE_VISIBILITY,
  planned_c_section: { showHospital: true, showLabor: false },
} as const satisfies Record<BirthJourney, MilestoneVisibility>;

export type MilestoneVisibilityPreset = PresetBirthJourney;

export function milestoneVisibilityForPreset(preset: BirthJourney) {
  return MILESTONE_VISIBILITY_PRESETS[preset];
}

export function birthJourneyForVisibility(visibility: MilestoneVisibility): BirthJourney {
  if (visibility.showLabor && visibility.showHospital) {
    return "labor";
  }
  if (visibility.showLabor && !visibility.showHospital) {
    return "home_birth";
  }
  if (!visibility.showLabor && visibility.showHospital) {
    return "planned_c_section";
  }
  return "custom";
}

export function isPresetBirthJourney(journey: BirthJourney): journey is PresetBirthJourney {
  return journey !== "custom";
}

/**
 * Current status derived from baby data
 */
export type BabyStatus =
  | { type: "not_yet" }
  | { date: string; type: "labor_started" }
  | { date: string; type: "gone_to_hospital" }
  | { date: string; type: "born" };

export const STATUS_ORDER = {
  born: 3,
  gone_to_hospital: 2,
  labor_started: 1,
  not_yet: 0,
} as const;

export type NotifiableStatus =
  | "labor_started"
  | "gone_to_hospital"
  | "born"
  | "photo_added"
  | "update_posted";

export const MILESTONE_LABELS = {
  born: "Born",
  gone_to_hospital: "Gone to hospital",
  labor_started: "Labour started",
} as const satisfies Record<Milestone, string>;

/**
 * Maps a milestone to the baby fields that hold its canonical timestamp and
 * its legacy per-stage message.
 */
export const MILESTONE_FIELDS = {
  born: { date: "babyBorn", message: "babyBornMessage" },
  gone_to_hospital: { date: "wentToHospital", message: "hospitalMessage" },
  labor_started: { date: "laborStarted", message: "laborStartedMessage" },
} as const satisfies Record<
  Milestone,
  { date: keyof MilestoneDates; message: keyof BabyPreviewMessages }
>;

/** Chronological order — independent of `MILESTONE_FIELDS` key insertion order. */
export const MILESTONES = [
  "labor_started",
  "gone_to_hospital",
  "born",
] as const satisfies ReadonlyArray<Milestone>;

type MilestonePolicyInput = {
  babyBorn?: string | null;
  birthJourney?: BirthJourney | null;
  laborStarted?: string | null;
  milestoneVisibility?: MilestoneVisibility | null;
  wentToHospital?: string | null;
};

export type MilestonePolicy = {
  canMark: (milestone: Milestone) => boolean;
  currentStatus: BabyStatus;
  isReached: (milestone: Milestone) => boolean;
  isVisible: (milestone: Milestone) => boolean;
  progressPercent: number;
  visibility: MilestoneVisibility;
  visibleMilestones: ReadonlyArray<Milestone>;
};

/**
 * The single policy seam for milestone visibility and allowed transitions.
 * Stored selections derive visibility. Public projections can pass the neutral
 * visibility object instead, without exposing the selection.
 */
export function getMilestonePolicy(baby: MilestonePolicyInput): MilestonePolicy {
  const visibility = baby.birthJourney
    ? milestoneVisibilityForPreset(baby.birthJourney)
    : (baby.milestoneVisibility ?? DEFAULT_MILESTONE_VISIBILITY);
  const isVisible = (milestone: Milestone) =>
    milestone === "born" ||
    (milestone === "labor_started" ? visibility.showLabor : visibility.showHospital);
  const visibleMilestones = MILESTONES.filter(isVisible);

  let currentStatus: BabyStatus = { type: "not_yet" };
  for (const milestone of [...visibleMilestones].toReversed()) {
    const date = baby[MILESTONE_FIELDS[milestone].date];
    if (date) {
      currentStatus = { date, type: milestone };
      break;
    }
  }

  const isReached = (milestone: Milestone) =>
    isVisible(milestone) &&
    currentStatus.type !== "not_yet" &&
    STATUS_ORDER[currentStatus.type] >= STATUS_ORDER[milestone];
  const reachedCount = visibleMilestones.filter(isReached).length;

  return {
    canMark: (milestone) =>
      isVisible(milestone) && STATUS_ORDER[milestone] > STATUS_ORDER[currentStatus.type],
    currentStatus,
    isReached,
    isVisible,
    progressPercent: (reachedCount / visibleMilestones.length) * 100,
    visibility,
    visibleMilestones,
  };
}

/**
 * Derive the latest publicly visible status from baby data.
 */
export function getCurrentStatus(baby: MilestonePolicyInput): BabyStatus {
  return getMilestonePolicy(baby).currentStatus;
}

/**
 * Returns the latest marked milestone that must be removed before `milestone`
 * can be removed. Milestones are unwound in reverse order so the canonical
 * status never contains gaps.
 */
export function getBlockingLaterMilestone(baby: Partial<MilestoneDates>, milestone: Milestone) {
  for (let index = MILESTONES.length - 1; index >= 0; index -= 1) {
    const candidate = MILESTONES[index];
    if (
      candidate &&
      STATUS_ORDER[candidate] > STATUS_ORDER[milestone] &&
      baby[MILESTONE_FIELDS[candidate].date]
    ) {
      return candidate;
    }
  }
  return null;
}

/**
 * Check if status moved forward (e.g., not_yet → labor_started → gone_to_hospital → born)
 * Type guard that narrows `after` to exclude "not_yet" when returning true
 */
export function isStatusForward(
  before: BabyStatus,
  after: BabyStatus,
): after is BabyStatus & { type: Milestone } {
  return STATUS_ORDER[after.type] > STATUS_ORDER[before.type];
}

export function isMilestoneNotificationType(
  notificationType: NotifiableStatus,
): notificationType is Milestone {
  return (
    notificationType === "labor_started" ||
    notificationType === "gone_to_hospital" ||
    notificationType === "born"
  );
}

export type Maybe<T> = T | null | undefined;
