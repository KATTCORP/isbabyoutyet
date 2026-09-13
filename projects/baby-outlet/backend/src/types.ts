import type { Doc } from "../convex/_generated/dataModel";

export const BIRTH_JOURNEYS = ["labor", "home_birth", "planned_c_section"] as const;

export type BirthJourney = (typeof BIRTH_JOURNEYS)[number];

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
  laborStarted: string | null;
  wentToHospital: string | null;
  babyBorn: string | null;
};

/**
 * Preview-only per-stage messages. Live pages keep copy on timeline updates;
 * the homepage preview still passes these as query params.
 */
export type BabyPreviewMessages = {
  laborStartedMessage: string | null;
  hospitalMessage: string | null;
  babyBornMessage: string | null;
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
> &
  MilestoneDates &
  Partial<{ milestoneVisibility: MilestoneVisibility }>;

export type PreviewBabyData = BabyData & BabyPreviewMessages;

/**
 * Partial update to baby data - used by editors
 */
export type BabyUpdate = Partial<
  Pick<BabyData, "name" | "dueDate" | "theme" | "locale" | "encouragementsDisabled"> & {
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
  showLabor: boolean;
  showHospital: boolean;
};

export const DEFAULT_MILESTONE_VISIBILITY = {
  showLabor: true,
  showHospital: true,
} as const satisfies MilestoneVisibility;

export const MILESTONE_VISIBILITY_PRESETS = {
  labor: DEFAULT_MILESTONE_VISIBILITY,
  home_birth: { showLabor: true, showHospital: false },
  planned_c_section: { showLabor: false, showHospital: true },
} as const satisfies Record<string, MilestoneVisibility>;

export type MilestoneVisibilityPreset = keyof typeof MILESTONE_VISIBILITY_PRESETS;

export function milestoneVisibilityForPreset(preset: MilestoneVisibilityPreset) {
  return MILESTONE_VISIBILITY_PRESETS[preset];
}

/**
 * Current status derived from baby data
 */
export type BabyStatus =
  | { type: "not_yet" }
  | { type: "labor_started"; date: string }
  | { type: "gone_to_hospital"; date: string }
  | { type: "born"; date: string };

export const STATUS_ORDER = {
  not_yet: 0,
  labor_started: 1,
  gone_to_hospital: 2,
  born: 3,
} as const;

export type NotifiableStatus =
  | "labor_started"
  | "gone_to_hospital"
  | "born"
  | "photo_added"
  | "update_posted";

export const MILESTONE_LABELS = {
  labor_started: "Labour started",
  gone_to_hospital: "Gone to hospital",
  born: "Born",
} as const satisfies Record<Milestone, string>;

/**
 * Maps a milestone to the baby fields that hold its canonical timestamp and
 * its legacy per-stage message.
 */
export const MILESTONE_FIELDS = {
  labor_started: { date: "laborStarted", message: "laborStartedMessage" },
  gone_to_hospital: { date: "wentToHospital", message: "hospitalMessage" },
  born: { date: "babyBorn", message: "babyBornMessage" },
} as const satisfies Record<
  Milestone,
  { date: keyof MilestoneDates; message: keyof BabyPreviewMessages }
>;

export const MILESTONES = Object.keys(MILESTONE_FIELDS) as Milestone[];

type MilestonePolicyInput = {
  babyBorn?: string | null;
  wentToHospital?: string | null;
  laborStarted?: string | null;
  birthJourney?: BirthJourney | null;
  milestoneVisibility?: MilestoneVisibility | null;
};

export type MilestonePolicy = {
  visibility: MilestoneVisibility;
  visibleMilestones: readonly Milestone[];
  currentStatus: BabyStatus;
  isVisible: (milestone: Milestone) => boolean;
  isReached: (milestone: Milestone) => boolean;
  canMark: (milestone: Milestone) => boolean;
  progressPercent: number;
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
  for (const milestone of [...visibleMilestones].reverse()) {
    const date = baby[MILESTONE_FIELDS[milestone].date];
    if (typeof date === "string" && date) {
      currentStatus = { type: milestone, date };
      break;
    }
  }

  const isReached = (milestone: Milestone) =>
    isVisible(milestone) &&
    currentStatus.type !== "not_yet" &&
    STATUS_ORDER[currentStatus.type] >= STATUS_ORDER[milestone];
  const reachedCount = visibleMilestones.filter(isReached).length;

  return {
    visibility,
    visibleMilestones,
    currentStatus,
    isVisible,
    isReached,
    canMark: (milestone) =>
      isVisible(milestone) && STATUS_ORDER[milestone] > STATUS_ORDER[currentStatus.type],
    progressPercent: (reachedCount / visibleMilestones.length) * 100,
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
