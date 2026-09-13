import { BabyNav } from "@/components/baby/baby-nav";
import { Baby } from "@phosphor-icons/react";
import { ProgressIndicator } from "@/components/baby/progress-indicator";
import { SettingsPanel } from "@/components/baby/settings-panel";
import { StatusDisplay } from "@/components/baby/status-display";
import type { PreviewBabyData } from "@baby-outlet/backend/src/types";
import {
  getCurrentStatus,
  milestoneVisibilityForPreset,
  MILESTONE_FIELDS,
} from "@baby-outlet/backend/src/types";
import { getThemeCss } from "@/components/baby/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { translate, useI18n } from "@/lib/i18n";
import { robotsNoIndexMeta } from "@/lib/seo";

function getDefaultBabyData(): PreviewBabyData {
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 7);
  const laborStarted = new Date(now);
  laborStarted.setHours(laborStarted.getHours() - 2);

  return {
    name: "Baby",
    dueDate: dueDate.toISOString(),
    dueDateDisplayMode: "exact",
    publicDueDateText: null,
    theme: null,
    laborStarted: null,
    wentToHospital: null,
    babyBorn: null,
    milestoneVisibility: milestoneVisibilityForPreset("labor"),
    hospitalMessage: null,
    babyBornMessage: null,
    laborStartedMessage: null,
    photoId: null,
  };
}
const searchSchema = z.object({
  name: z.string().default("Baby"),
  dueDate: z.string().nullable().optional(),
  dueDateDisplayMode: z.union([z.literal("exact"), z.literal("message")]).optional(),
  publicDueDateText: z.string().nullable().optional(),
  theme: z.string().nullable().optional(),
  laborStarted: z.string().nullable().optional(),
  wentToHospital: z.string().nullable().optional(),
  babyBorn: z.string().nullable().optional(),
  hospitalMessage: z.string().nullable().optional(),
  babyBornMessage: z.string().nullable().optional(),
  laborStartedMessage: z.string().nullable().optional(),
  birthJourney: z
    .union([z.literal("labor"), z.literal("home_birth"), z.literal("planned_c_section")])
    .optional(),
  settings: z.boolean().optional(),
});

export const Route = createFileRoute("/preview")({
  component: PreviewPage,
  validateSearch: searchSchema,
  head: (opts) => ({
    meta: [
      {
        title: translate(opts.match.context.locale, "Preview – {{title}}", {
          title: translate(
            opts.match.context.locale,
            "Is Baby Out Yet? – Share Your Baby's Arrival",
          ),
        }),
      },
      {
        name: "description",
        content: translate(
          opts.match.context.locale,
          "Preview how your baby tracking page will look at different stages.",
        ),
      },
      ...robotsNoIndexMeta(),
    ],
  }),
});

export function PreviewPage() {
  const { t, locale } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const birthJourney = search.birthJourney ?? "labor";

  const baby: PreviewBabyData = {
    ...getDefaultBabyData(),
    ...search,
    milestoneVisibility: milestoneVisibilityForPreset(birthJourney),
  };
  const currentStatus = getCurrentStatus(baby);
  const themeCss = getThemeCss(baby.theme);

  // The preview has no timeline; simulate the latest update from the stage message
  const stageMessage =
    currentStatus.type === "born"
      ? baby.babyBornMessage
      : currentStatus.type === "gone_to_hospital"
        ? baby.hospitalMessage
        : currentStatus.type === "labor_started"
          ? baby.laborStartedMessage
          : null;
  const latestUpdate =
    currentStatus.type !== "not_yet" && stageMessage
      ? { message: stageMessage, postedAt: Date.parse(currentStatus.date) }
      : null;

  return (
    <div>
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      <SettingsPanel
        baby={baby}
        birthJourney={birthJourney}
        onUpdate={(update) => {
          navigate({
            search: {
              ...search,
              ...update,
            },
            replace: true,
          });
        }}
        onMilestoneRedate={(milestone, occurredAt) => {
          void navigate({
            search: {
              ...search,
              [MILESTONE_FIELDS[milestone].date]: occurredAt,
            },
            replace: true,
          });
        }}
        onMilestoneRemove={(milestone) => {
          void navigate({
            search: {
              ...search,
              [MILESTONE_FIELDS[milestone].date]: null,
            },
            replace: true,
          });
        }}
        open={!!search.settings}
        onOpenChange={(open) => {
          void navigate({
            search: {
              ...search,
              settings: open || undefined,
            },
            replace: true,
          });
        }}
        profileLocale={locale}
        onDelete={null}
        coParents={null}
      />

      <div className="min-h-screen bg-background bg-dots">
        <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 backdrop-blur-md shadow-sm transition-transform hover:-rotate-2"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                <Baby className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
            </Link>
            <BabyNav
              shareLink=""
              onPostUpdate={null}
              onShareCopied={null}
              onSettingsOpened={null}
              settingsButton={{
                to: "/preview",
                search: {
                  ...search,
                  settings: search.settings ? undefined : true,
                },
              }}
              settingsOpen={!!search.settings}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-2xl px-4 pb-16">
          <h1 className="px-2 pt-10 pb-10 text-center text-4xl font-black tracking-tight text-foreground text-balance md:pt-14 md:text-6xl">
            {t("Is {{name}} out yet?", { name: baby.name })}
          </h1>

          <section className="rounded-[2rem] border-2 border-border bg-card px-6 pb-8 text-center pop-shadow-strong md:px-10">
            <StatusDisplay
              baby={baby}
              currentStatus={currentStatus}
              latestUpdate={latestUpdate}
              photoUrl={null}
              thumbnailUrl={null}
              blurDataUrl={null}
            />
            <div className="my-8 border-t-2 border-dashed border-border" aria-hidden="true" />
            <ProgressIndicator baby={baby} currentStatus={currentStatus} />
          </section>
        </main>

        <footer className="border-t-2 border-border/60 bg-background/60 py-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1 px-6 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("Having a baby? Are people messaging you non-stop? Create your own page →")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
