import { BabyNav } from "@/components/baby/baby-nav";
import { BabyIcon } from "@phosphor-icons/react";
import { ProgressIndicator } from "@/components/baby/progress-indicator";
import { SettingsPanel } from "@/components/baby/settings-panel";
import { useFormGuard } from "@/components/Form";
import { StatusDisplay } from "@/components/baby/status-display";
import type { PreviewBabyData } from "@workspace/convex/src/types";
import {
  getCurrentStatus,
  milestoneVisibilityForPreset,
  MILESTONE_FIELDS,
} from "@workspace/convex/src/types";
import { getThemeCss } from "@/components/baby/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { translate, useI18n, getDetectedLocale } from "@/lib/i18n";
import { closeOverlayLink, overlayCloseLinkProps } from "@/lib/overlay-nav";
import { robotsNoIndexMeta } from "@/lib/seo";
import { DEFAULT_TIME_ZONE } from "@workspace/convex/src/timeZone";
import { previewCacheHeaders } from "@/lib/cachePolicy";

function getDefaultBabyData(): PreviewBabyData {
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 7);
  const laborStarted = new Date(now);
  laborStarted.setHours(laborStarted.getHours() - 2);
  const locale = getDetectedLocale();

  return {
    babyBorn: null,
    babyBornMessage: null,
    dueDate: dueDate.toISOString(),
    dueDateDisplayMode: "exact",
    hospitalMessage: null,
    laborStarted: null,
    laborStartedMessage: null,
    milestoneVisibility: milestoneVisibilityForPreset("labor"),
    name: translate(locale, "Baby"),
    photoId: null,
    publicDueDateText: null,
    theme: null,
    timeZone: DEFAULT_TIME_ZONE,
    wentToHospital: null,
  };
}

const searchSchema = z.object({
  babyBorn: z.string().nullable().optional(),
  babyBornMessage: z.string().nullable().optional(),
  birthJourney: z
    .union([
      z.literal("labor"),
      z.literal("home_birth"),
      z.literal("planned_c_section"),
      z.literal("custom"),
    ])
    .optional(),
  dueDate: z.string().nullable().optional(),
  dueDateDisplayMode: z.union([z.literal("exact"), z.literal("message")]).optional(),
  hospitalMessage: z.string().nullable().optional(),
  laborStarted: z.string().nullable().optional(),
  laborStartedMessage: z.string().nullable().optional(),
  name: z.string().default("Baby"),
  publicDueDateText: z.string().nullable().optional(),
  settings: z.boolean().optional(),
  theme: z.string().nullable().optional(),
  wentToHospital: z.string().nullable().optional(),
});

export type PreviewSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/preview")({
  component: PreviewPage,
  validateSearch: searchSchema,
  headers: previewCacheHeaders,
  head: (opts) => {
    const locale = opts.match.context.locale ?? getDetectedLocale();
    return {
      meta: [
        {
          title: translate(locale, "Preview – {{title}}", {
            title: translate(locale, "Is Baby Out Yet? – Share Your Baby's Arrival"),
          }),
        },
        {
          content: translate(
            locale,
            "Preview how your baby tracking page will look at different stages.",
          ),
          name: "description",
        },
        ...robotsNoIndexMeta(),
      ],
    };
  },
});

function noop() {}

export function PreviewPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { locale, t } = useI18n();
  const birthJourney = search.birthJourney ?? "labor";

  const baby: PreviewBabyData = {
    ...getDefaultBabyData(),
    ...search,
    milestoneVisibility: milestoneVisibilityForPreset(birthJourney),
  };
  const currentStatus = getCurrentStatus(baby);
  const themeCss = getThemeCss(baby.theme);
  // The preview settings dialog is URL-controlled (`?settings=1`), so the
  // guard mirrors the search param instead of owning open state.
  const settingsGuard = useFormGuard({
    onOpenChange: (open) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: {
          ...search,
          settings: open || undefined,
        },
      });
    },
    open: !!search.settings,
  });

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
        coParents={null}
        messagePush={null}
        onDelete={null}
        onMilestoneRedate={(milestone, occurredAt) => {
          void navigate({
            replace: true,
            resetScroll: false,
            search: {
              ...search,
              [MILESTONE_FIELDS[milestone].date]: occurredAt,
            },
          });
        }}
        onMilestoneRemove={(milestone) => {
          void navigate({
            replace: true,
            resetScroll: false,
            search: {
              ...search,
              [MILESTONE_FIELDS[milestone].date]: null,
            },
          });
        }}
        onUpdate={(update) => {
          void navigate({
            replace: true,
            resetScroll: false,
            search: {
              ...search,
              ...update,
            },
          });
        }}
        overlay={{
          close: settingsGuard.close,
          closeLinkProps: overlayCloseLinkProps(closeOverlayLink({ to: "/" }), settingsGuard.close),
          guard: settingsGuard,
          rootProps: { ...settingsGuard.rootProps, onOpenChangeComplete: noop },
        }}
        profileLocale={locale}
      />

      <div className="min-h-screen bg-background bg-dots">
        <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
            <Link
              className="flex items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 backdrop-blur-md shadow-sm transition-transform hover:-rotate-2"
              to="/"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                <BabyIcon className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
            </Link>
            <BabyNav
              dashboardButton={null}
              onDismissPostUpdate={null}
              onDismissSettings={null}
              onDismissShare={null}
              onDismissSignIn={null}
              onSettingsOpened={null}
              postUpdateButton={null}
              postUpdateOpen={false}
              settingsButton={{
                replace: true,
                resetScroll: false,
                search: {
                  ...search,
                  settings: search.settings ? undefined : true,
                },
                to: "/preview",
              }}
              settingsOpen={!!search.settings}
              shareButton={null}
              shareOpen={false}
              signInButton={null}
              signInOpen={false}
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
              blurDataUrl={null}
              currentStatus={currentStatus}
              latestUpdate={latestUpdate}
              photoUrl={null}
              publicId={null}
              thumbnailUrl={null}
            />
            <div aria-hidden="true" className="my-8 border-t-2 border-dashed border-border" />
            <ProgressIndicator baby={baby} currentStatus={currentStatus} />
          </section>
        </main>

        <footer className="border-t-2 border-border/60 bg-background/60 py-8 text-center">
          <Link
            className="inline-flex items-center gap-1 px-6 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
            to="/"
          >
            {t("Having a baby? Are people messaging you non-stop? Create your own page →")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
