import { useEffect } from "react";
import { Button } from "@workspace/ui/components/button";
import { ModeToggle } from "@workspace/ui/components/mode-toggle";
import { createFileRoute, Link } from "@tanstack/react-router";
import { allKeyed } from "@workspace/query-prefetch";
import { getConvexQueryPreloader, usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { useMutation } from "convex/react";
import { Baby as BabyIcon, Plus, Shield, SignOut, Sparkle } from "@phosphor-icons/react";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import type { BirthJourney } from "@baby-outlet/backend/src/types";
import { DashboardBabyCard } from "@/components/baby/dashboard-baby-card";
import { OnboardingHost } from "@/components/onboarding/onboarding-host";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { LanguageSettings } from "@/components/language-settings";
import { useI18n } from "@/lib/i18n";
import { ADMIN_DEFAULT_SEARCH } from "@/routes/_auth/dashboard/admin";

export const Route = createFileRoute("/_auth/dashboard/")({
  component: DashboardPage,
  loader: async (opts) => {
    const preloader = getConvexQueryPreloader(opts.context.queryClient);
    return await allKeyed({
      babies: preloader.ensureQueryData(api.baby.listByUser, {}),
      onboarding: preloader.ensureQueryData(api.onboarding.getMine, {}),
      profile: preloader.ensureQueryData(api.profile.get, {}),
    });
  },
});

function DashboardPage() {
  const { t } = useI18n();
  const loaderData = Route.useLoaderData();
  const babiesQuery = usePreloadedConvexQuery(api.baby.listByUser, loaderData.babies);
  const onboardingQuery = usePreloadedConvexQuery(api.onboarding.getMine, loaderData.onboarding);
  const profileQuery = usePreloadedConvexQuery(api.profile.get, loaderData.profile);
  const babies = babiesQuery.data;
  const progress = onboardingQuery.data;
  const profile = profileQuery.data;

  const claimInvites = useMutation(api.coParents.claimPendingInvites);
  useEffect(() => {
    void claimInvites({});
  }, [claimInvites]);

  const restartTour = useMutation(api.onboarding.restart);

  return (
    <div className="flex min-h-screen flex-col bg-background bg-dots">
      <OnboardingHost
        surface="dashboard"
        onboarding={loaderData.onboarding}
        enabled={undefined}
        spotlight={undefined}
        babyPublicId={undefined}
        onGoToStep={undefined}
      />
      {/* Floating header */}
      <header className="sticky top-0 z-20 px-4 pt-3 pb-1">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 backdrop-blur-md shadow-sm transition-transform hover:-rotate-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
              <BabyIcon className="h-4 w-4 text-primary" />
            </span>
            <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
          </Link>
          <div className="flex items-center gap-1 rounded-full border-2 border-border bg-background/85 p-1 backdrop-blur-md shadow-sm">
            {profile?.isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full font-bold"
                render={
                  <Link to="/dashboard/admin" search={ADMIN_DEFAULT_SEARCH} preload="viewport" />
                }
                nativeButton={false}
              >
                <Shield className="w-4 h-4" />
                {t("Admin")}
              </Button>
            ) : null}
            <Button
              size="sm"
              className="rounded-full font-bold"
              render={<Link to="/dashboard/add" />}
              nativeButton={false}
            >
              <Plus className="w-4 h-4" />
              {t("Add Baby")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground"
              aria-label={t("Restart getting started tour")}
              title={t("Restart tour")}
              onClick={async () => {
                await restartTour({});
                toast.success(t("Tour restarted"));
              }}
            >
              <Sparkle className="w-4 h-4" />
            </Button>
            <ModeToggle className="rounded-full" />
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full font-bold"
              onClick={async () => {
                // expectAuth: reload so auth is re-resolved from a clean slate
                await authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      window.location.href = "/";
                    },
                    onError: (error) => {
                      toast.error(error.error.message);
                    },
                  },
                });
              }}
            >
              <SignOut className="w-4 h-4" />
              {t("Logout")}
            </Button>
          </div>
        </div>
      </header>

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

      <footer className="border-t-2 border-border/60 bg-background/60 px-4 py-8">
        <div className="mx-auto flex max-w-5xl justify-center">
          <LanguageSettings profile={loaderData.profile} />
        </div>
      </footer>
    </div>
  );
}

type DashboardBaby = {
  _id: Id<"baby">;
  name: string;
  publicId: string;
  dueDate: string | null;
  dueDateDisplayMode: "exact" | "message";
  publicDueDateText: string | null;
  role: "owner" | "coParent";
} & Partial<{
  laborStarted: string | null;
  wentToHospital: string | null;
  babyBorn: string | null;
  birthJourney: BirthJourney;
}>;

export function DashboardBabyList(props: {
  babies: DashboardBaby[];
  tourBabyPublicId: string | undefined;
}) {
  const { t } = useI18n();

  if (props.babies.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-[2rem] border-2 border-dashed border-border bg-card/60 py-14 text-center">
        <p className="text-5xl" aria-hidden="true">
          🍼
        </p>
        <h3 className="mt-4 text-2xl font-black text-foreground">{t("No babies added yet")}</h3>
        <p className="mx-auto mt-2 max-w-md font-medium text-muted-foreground">
          {t("Get started by adding your first baby to track their journey")}
        </p>
        <Button
          size="lg"
          className="mt-6 rounded-full font-extrabold pop-shadow"
          render={<Link to="/dashboard/add" />}
          nativeButton={false}
          data-tour-id="add_baby"
        >
          <Plus className="w-4 h-4" />
          {t("Add Your First Baby")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {props.babies.map((baby, index) => (
        <DashboardBabyCard
          key={baby._id}
          baby={baby}
          index={index}
          dataTourId={props.tourBabyPublicId === baby.publicId ? "tour_baby" : undefined}
        />
      ))}
    </div>
  );
}
