import { Button } from "@workspace/ui/components/button";
import { ButtonGroup } from "@workspace/ui/components/button-group";
import { ModeToggle } from "@workspace/ui/components/mode-toggle";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { allKeyed } from "@workspace/query-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { BabyIcon, PlusIcon, UserIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import type { FunctionReturnType } from "convex/server";
import { DashboardBabyCard } from "@/components/baby/dashboard-baby-card";
import { OnboardingHost } from "@/components/onboarding/onboarding-host";
import { api } from "@workspace/convex/convex/_generated/api";
import { useI18n } from "@/lib/i18n";
import { useDashboardSettingsOverlayLinks } from "@/lib/overlay-nav";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPageLayout,
  loader: async (opts) => {
    const preloader = opts.context.convexPreloader;
    return await allKeyed({
      babies: preloader.ensureQueryData(api.baby.listByUser, {}),
      onboarding: preloader.ensureQueryData(api.onboarding.getMine, {}),
    });
  },
});

export function DashboardPageLayout() {
  return (
    <>
      <DashboardPage />
      <Outlet />
    </>
  );
}

function DashboardPage() {
  const loaderData = Route.useLoaderData();
  const { t } = useI18n();
  const babiesQuery = usePreloadedConvexQuery(api.baby.listByUser, loaderData.babies);
  const onboardingQuery = usePreloadedConvexQuery(api.onboarding.getMine, loaderData.onboarding);
  const babies = babiesQuery.data;
  const progress = onboardingQuery.data;

  return (
    <div className="flex min-h-screen flex-col bg-background bg-dots">
      <OnboardingHost
        enabled={undefined}
        onboarding={loaderData.onboarding}
        spotlight={undefined}
        surface="dashboard"
      />
      <DashboardHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl">
            {t("Your")}{" "}
            <span className="inline-block -rotate-1 rounded-2xl bg-primary/15 px-3 text-primary">
              {t("babies")}
            </span>{" "}
            👶
          </h1>
          <p className="mt-2 font-semibold text-muted-foreground">
            {t("Track and manage all your babies' journeys")}
          </p>
        </div>

        <DashboardBabyList babies={babies} tourBabyPublicId={progress.tourBaby?.publicId} />
      </main>
    </div>
  );
}

export function DashboardHeader() {
  const { t } = useI18n();
  const settings = useDashboardSettingsOverlayLinks();

  return (
    <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
        <Link
          className="flex items-center gap-2 rounded-full bg-background/85 py-1.5 pl-2 pr-4 shadow-sm backdrop-blur-md transition-transform hover:-rotate-2"
          to="/"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/15">
            <BabyIcon className="size-4 text-primary" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
        </Link>
        <ButtonGroup className="shrink-0 rounded-full border-2 border-border bg-background/85 p-1 shadow-sm backdrop-blur-md">
          <ButtonGroup aria-label={t("Owner actions")}>
            <Button
              className="font-bold"
              nativeButton={false}
              render={<Link to="/dashboard/add" />}
              variant="default"
            >
              <PlusIcon data-icon="inline-start" />
              {t("Add Baby")}
            </Button>
          </ButtonGroup>
          <ButtonGroup aria-label={t("Page actions")}>
            <ModeToggle />
            <Button
              aria-label={t("Settings")}
              nativeButton={false}
              render={<Link {...settings.openLink} />}
              size="icon"
              variant="ghost"
            >
              <Avatar className="after:border-0" size="sm">
                <AvatarFallback>
                  <UserIcon />
                </AvatarFallback>
              </Avatar>
            </Button>
          </ButtonGroup>
        </ButtonGroup>
      </div>
    </header>
  );
}

type DashboardBaby = Pick<
  FunctionReturnType<typeof api.baby.listByUser>[number],
  | "_id"
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

export function DashboardBabyList(props: {
  babies: Array<DashboardBaby>;
  tourBabyPublicId: string | undefined;
}) {
  const { t } = useI18n();

  if (props.babies.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-[2rem] border-2 border-dashed border-border bg-card/60 py-14 text-center">
        <p aria-hidden="true" className="text-5xl">
          🍼
        </p>
        <h3 className="mt-4 text-2xl font-black text-foreground">{t("No babies added yet")}</h3>
        <p className="mx-auto mt-2 max-w-md font-medium text-muted-foreground">
          {t("Get started by adding your first baby to track their journey")}
        </p>
        <Button
          className="mt-6 rounded-full font-extrabold pop-shadow"
          data-tour-id="add_baby"
          nativeButton={false}
          render={<Link to="/dashboard/add" />}
          size="lg"
        >
          <PlusIcon className="w-4 h-4" />
          {t("Add Your First Baby")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {props.babies.map((baby, index) => (
        <DashboardBabyCard
          baby={baby}
          dataTourId={props.tourBabyPublicId === baby.publicId ? "tour_baby" : undefined}
          index={index}
          key={baby._id}
        />
      ))}
    </div>
  );
}
