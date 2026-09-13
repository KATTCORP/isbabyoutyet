import { ArrowRightIcon, CalendarHeartIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import type { FunctionReturnType } from "convex/server";
import { getCurrentStatus } from "@baby-outlet/backend/src/types";
import type { api } from "@baby-outlet/backend/convex/_generated/api";
import { formatDueDate, getDaysUntilDueDate, getOverdueDays } from "./utils";
import { useI18n } from "@/lib/i18n";

type DashboardBabyCardBaby = Pick<
  FunctionReturnType<typeof api.baby.listByUser>[number],
  | "babyBorn"
  | "birthJourney"
  | "dueDate"
  | "dueDateDisplayMode"
  | "laborStarted"
  | "name"
  | "publicDueDateText"
  | "publicId"
  | "role"
  | "timeZone"
  | "wentToHospital"
>;

type DashboardBabyCardProps = {
  baby: DashboardBabyCardBaby;
  /** Coachmark target for the first-run tour */
  dataTourId: string | undefined;
  index: number;
};

const STATUS_EMOJI = {
  born: "🎉",
  gone_to_hospital: "🏥",
  labor_started: "💫",
  not_yet: "👶",
} as const;

function StatusBadge(props: { baby: DashboardBabyCardBaby }) {
  const { t } = useI18n();
  const currentStatus = getCurrentStatus(props.baby);

  switch (currentStatus.type) {
    case "born":
      return <Badge className="rounded-full font-bold">{t("Baby born")}</Badge>;
    case "labor_started":
      return <Badge className="rounded-full font-bold">{t("Labour started")}</Badge>;
    case "gone_to_hospital":
      return <Badge className="rounded-full font-bold">{t("Gone to hospital")}</Badge>;
    case "not_yet": {
      if (props.baby.dueDateDisplayMode === "message" || !props.baby.dueDate) {
        return (
          <Badge
            className="rounded-full border-2 border-primary/20 bg-primary/5 font-bold"
            variant="outline"
          >
            {t("Not yet")}
          </Badge>
        );
      }
      const overdueDays = getOverdueDays(props.baby.dueDate, props.baby.timeZone);
      const daysUntilDueDate = getDaysUntilDueDate(props.baby.dueDate, props.baby.timeZone);
      if (overdueDays > 0) {
        return (
          <Badge className="rounded-full font-bold">
            {t(overdueDays === 1 ? "{{count}} day overdue" : "{{count}} days overdue", {
              count: overdueDays,
            })}
          </Badge>
        );
      }
      if (daysUntilDueDate === 0) {
        return <Badge className="rounded-full font-bold">{t("Due today!")}</Badge>;
      }
      return (
        <Badge
          className="rounded-full border-2 border-primary/20 bg-primary/5 font-bold"
          variant="outline"
        >
          {t(
            daysUntilDueDate === 1
              ? "{{count}} day until due date"
              : "{{count}} days until due date",
            { count: daysUntilDueDate },
          )}
        </Badge>
      );
    }
    default: {
      const _exhaustive: never = currentStatus;
      return _exhaustive;
    }
  }
}

export function DashboardBabyCard(props: DashboardBabyCardProps) {
  const { locale, t } = useI18n();
  const baby = props.baby;
  const currentStatus = getCurrentStatus(baby);
  const publicDueDateText = baby.publicDueDateText?.trim() ?? "";
  const dateLine =
    currentStatus.type === "born"
      ? t("Born {{date}}", { date: formatDueDate(currentStatus.date, locale) })
      : baby.dueDateDisplayMode === "message"
        ? publicDueDateText || t("Due date hidden")
        : t("Due {{date}}", {
            date: baby.dueDate ? formatDueDate(baby.dueDate, locale) : "",
          });

  return (
    <Link
      className="group"
      data-tour-id={props.dataTourId}
      params={{ publicId: baby.publicId }}
      to="/baby/$publicId"
    >
      <div
        className={`flex h-full flex-col rounded-3xl border-2 border-border bg-card p-6 pop-shadow transition-transform group-hover:-translate-y-1 ${
          props.index % 2 === 0 ? "group-hover:-rotate-1" : "group-hover:rotate-1"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/25 bg-primary/10 text-xl">
            {STATUS_EMOJI[currentStatus.type]}
          </span>
          <ArrowRightIcon className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <h2 className="mt-4 text-2xl font-black tracking-tight text-foreground">{baby.name}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <CalendarHeartIcon className="h-3.5 w-3.5" />
          {dateLine}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {baby.role === "coParent" ? (
            <Badge
              className="rounded-full border-2 border-primary/20 bg-primary/5 font-bold"
              variant="outline"
            >
              {t("Shared with you")}
            </Badge>
          ) : null}
          <StatusBadge baby={baby} />
        </div>
      </div>
    </Link>
  );
}
