import { BabyNav } from "@/components/baby/baby-nav";
import { BabyIcon } from "@phosphor-icons/react";
import { EncouragementForm } from "@/components/baby/encouragements";
import { TimelineFeed } from "@/components/baby/timeline";
import { NotificationSubscribe } from "@/components/baby/notification-subscribe";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { visitorTagQuery } from "@/lib/visitor-tag";
import { ProgressIndicator } from "@/components/baby/progress-indicator";
import { ScheduledNotificationToast } from "@/components/baby/scheduled-notification-toast";
import { StatusDisplay } from "@/components/baby/status-display";
import { OnboardingHost, useCompleteOnboardingStep } from "@/components/onboarding/onboarding-host";
import type { BabyData } from "@isbabyoutyet/backend/src/types";
import { FORBIDDEN, getCurrentStatus } from "@isbabyoutyet/backend/src/types";
import { getThemeCss } from "@/components/baby/utils";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  retainSearchParams,
  useMatchRoute,
} from "@tanstack/react-router";
import { load, prefetch, swr, useQuery } from "@raf-query/react";
import { use } from "react";
import { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { openGraphImageMeta } from "@/lib/seo";
import { getBabySeo } from "@/lib/seo";
import { babyCache, sharedCacheHeaders } from "@/lib/cache";
import { replaceBabyPublicId } from "@/lib/baby-public-id-href";
import { babyPageRobotsHeaders, searchRobotsMeta } from "@/lib/robots";
import { useI18n } from "@/lib/i18n";
import { m } from "@/paraglide/messages";
import { BABY_FEED_HASH } from "@isbabyoutyet/backend/src/babyFeedUrl";
import { useHashScroll } from "@/lib/use-hash-scroll";
import { timelineInput, timelineQuery } from "@/lib/timeline-feed";
import { useDemoToast } from "@/lib/use-demo-toast";
import { isHomepageDemoPublicId } from "@isbabyoutyet/backend/src/seedCredentials";
import {
  useBabyLoginOverlayLinks,
  useBabyPostOverlayLinks,
  useBabySettingsOverlayLinks,
  useBabyShareOverlayLinks,
  useBabySignupOverlayLinks,
} from "@/lib/overlay-nav";

/**
 * Unknown keys are stripped, never rejected: a bad search param must not throw
 * a `SearchParamError` for a visitor following a shared link.
 *
 * @internal exported for tests
 */
export const babySearchSchema = z.object({
  /** A linked feed item (`babyFeedItemUrl`); the loader checks it, whatever it parsed as. */
  item: z.coerce.string().optional(),
});

export const Route = createFileRoute("/baby/$publicId")({
  component: BabyPageLayout,
  validateSearch: babySearchSchema,
  search: {
    // Links over or back to this page (overlays, the router's preloads of
    // them) keep its `?item=`, so the feed under them stays where it is.
    // A link that starts the feed over says `item: undefined`.
    middlewares: [retainSearchParams(["item"])],
  },
  loaderDeps: (opts) => ({ item: opts.search.item ?? null }),

  // Everything the page reads is named by the URL alone, so it all starts in
  // one round. For a baby that doesn't exist the other queries answer
  // `null`, `FORBIDDEN` or an empty feed, and the page is a 404; for a public
  // id the baby no longer goes by, the redirect starts the round again.
  // The overlays' loaders start beside this one, and the router lets the
  // 404 or the redirect here win over whatever they find.
  loader: async (opts) => {
    const publicId = opts.params.publicId;
    const [handles, data] = await load(opts.context.queryClient, {
      baby: swr(convexQuery(api.baby.getByPublicId), { id: publicId }),
      // This device's state, which only the browser knows (`ssr: false`):
      // the server returns its handle unstarted, and the browser runs it.
      browserPush: prefetch(browserPushCapabilityQuery, publicId),
      latestUpdate: swr(convexQuery(api.timeline.latestUpdate), { babyId: publicId }),
      managerBaby: swr(convexQuery(api.baby.getManagerBaby), { babyId: publicId }),
      me: swr(convexQuery(api.profile.get), {}),
      myAccess: swr(convexQuery(api.coParents.myAccess), { babyId: publicId }),
      onboarding: swr(convexQuery(api.onboarding.getMine), {}),
      scheduledNotifications: swr(convexQuery(api.baby.getScheduledNotifications), {
        babyId: publicId,
      }),
      subscriptionCount: swr(convexQuery(api.pushSubscriptions.getSubscriptionCount), {
        babyId: publicId,
      }),
      // The feed on screen stays while it has `?item=`, so following a
      // timestamp only moves the highlight.
      timeline: swr(timelineQuery, timelineInput({ from: opts.deps.item, publicId })),
      vapidPublicKey: swr(convexQuery(api.pushSubscriptions.getPublicKey), {}),
      visitorTag: prefetch(visitorTagQuery, publicId),
    });
    const babyDoc = data.baby;
    if (!babyDoc) {
      throw notFound();
    }
    if (babyDoc.publicId !== publicId) {
      throw redirect(
        replaceBabyPublicId({
          fromPublicId: publicId,
          href: opts.location.href,
          toPublicId: babyDoc.publicId,
        }),
      );
    }

    return { babyDoc, ...handles };
  },
  head: (opts) => {
    const babyDoc = opts.loaderData?.babyDoc;

    if (!babyDoc) {
      return {};
    }

    const seo = getBabySeo(babyDoc, opts.params.publicId);
    // Inline via `styles` (not `links`): TanStack Asset forces React 19
    // `precedence` on stylesheet links, which can leave theme CSS stuck after
    // navigating away. Inline head styles still paint before body (no FOUC)
    // and unmount cleanly with the route.
    const themeCss = getThemeCss(babyDoc.theme);
    const manifestUrl = `/baby/manifest/${babyDoc._id}`;

    return {
      links: [
        {
          href: manifestUrl,
          rel: "manifest",
        },
        {
          href: seo.canonical,
          rel: "canonical",
        },
      ],
      meta: [
        {
          title: seo.title,
        },
        {
          content: seo.description,
          name: "description",
        },
        {
          content: seo.title,
          property: "og:title",
        },
        {
          content: seo.description,
          property: "og:description",
        },
        {
          content: seo.ogUrl,
          property: "og:url",
        },
        {
          content: seo.locale.replace("-", "_"),
          property: "og:locale",
        },
        {
          // The root's is in the visitor's language. Nothing in a baby
          // page's HTML may be, or the CDN could not share it.
          content: m.app_name({}, { locale: seo.locale }),
          property: "og:site_name",
        },
        {
          content: "website",
          property: "og:type",
        },
        ...openGraphImageMeta({ alt: seo.imageAlt, imageUrl: seo.imageUrl }),
        {
          content: seo.title,
          name: "twitter:title",
        },
        {
          content: seo.description,
          name: "twitter:description",
        },
        {
          content: seo.themeColor,
          name: "theme-color",
        },
        ...searchRobotsMeta({ index: seo.indexable }),
      ],
      styles: themeCss
        ? [
            {
              children: themeCss,
              "data-baby-theme": babyDoc.theme ?? "",
            },
          ]
        : [],
    };
  },
  // Shared for the overlays under this page too. A visitor without a session
  // gets only what is public there, and one with a session is never shared.
  headers: (opts) => {
    const babyDoc = opts.loaderData?.babyDoc;
    const robots = babyPageRobotsHeaders(opts.params.publicId);
    // No baby is a 404, which nobody shares.
    return babyDoc ? { ...sharedCacheHeaders(babyCache(babyDoc, "anonymous")), ...robots } : robots;
  },
});

/**
 * Convert Convex Doc to BabyData for use with shared components
 */
export function docToBabyData(
  doc: NonNullable<FunctionReturnType<typeof api.baby.getByPublicId>>,
): BabyData {
  const common: Omit<BabyData, "dueDate" | "dueDateDisplayMode" | "publicDueDateText"> = {
    babyBorn: doc.babyBorn ?? null,
    laborStarted: doc.laborStarted ?? null,
    locale: doc.locale ?? null,
    milestoneVisibility: doc.milestoneVisibility,
    name: doc.name,
    photoId: doc.photoId ?? null,
    theme: doc.theme ?? null,
    timeZone: doc.timeZone,
    wentToHospital: doc.wentToHospital ?? null,
  };
  return doc.dueDateDisplayMode === "exact"
    ? {
        ...common,
        dueDate: doc.dueDate,
        dueDateDisplayMode: "exact",
        publicDueDateText: null,
      }
    : {
        ...common,
        dueDate: null,
        dueDateDisplayMode: "message",
        publicDueDateText: doc.publicDueDateText ?? null,
      };
}

type ManagerBabyDoc = Exclude<FunctionReturnType<typeof api.baby.getManagerBaby>, typeof FORBIDDEN>;

export function managerDocToBabyData(doc: ManagerBabyDoc): BabyData {
  return {
    babyBorn: doc.babyBorn ?? null,
    dueDate: doc.dueDate,
    dueDateDisplayMode: doc.dueDateDisplayMode,
    laborStarted: doc.laborStarted ?? null,
    locale: doc.locale ?? null,
    milestoneVisibility: doc.milestoneVisibility,
    name: doc.name,
    photoId: doc.photoId ?? null,
    publicDueDateText: doc.publicDueDateText,
    theme: doc.theme ?? null,
    timeZone: doc.timeZone,
    wentToHospital: doc.wentToHospital ?? null,
  };
}

function BabyPageLayout() {
  const { t } = useI18n();
  const params = Route.useParams();
  useDemoToast({
    enabled: isHomepageDemoPublicId(params.publicId),
    publicId: params.publicId,
  });
  const matchRoute = useMatchRoute();
  useHashScroll();
  const shareOpen = !!matchRoute({ to: "/baby/$publicId/share" });
  const settingsOpen = !!matchRoute({ to: "/baby/$publicId/settings" });
  const postUpdateOpen = !!matchRoute({ to: "/baby/$publicId/post" });
  const loginOpen = !!matchRoute({ to: "/baby/$publicId/login" });
  const signupOpen = !!matchRoute({ to: "/baby/$publicId/signup" });
  const photoOpen =
    !!matchRoute({ to: "/baby/$publicId/photo" }) ||
    !!matchRoute({ to: "/baby/$publicId/updates/$updateId/photo" });
  const loaderData = Route.useLoaderData();
  const loaderDeps = Route.useLoaderDeps();
  if (!loaderData) {
    throw notFound();
  }

  const [babyDocThenable] = useQuery(convexQuery(api.baby.getByPublicId), loaderData.baby);
  const babyDoc = use(babyDocThenable);
  if (!babyDoc) {
    throw notFound();
  }
  const baby = docToBabyData(babyDoc);

  const [latestUpdateThenable] = useQuery(
    convexQuery(api.timeline.latestUpdate),
    loaderData.latestUpdate,
  );
  const latestUpdate = use(latestUpdateThenable);
  const [meThenable] = useQuery(convexQuery(api.profile.get), loaderData.me);
  const me = use(meThenable);
  const [managerBabyResultThenable] = useQuery(
    convexQuery(api.baby.getManagerBaby),
    loaderData.managerBaby,
  );
  const managerBabyResult = use(managerBabyResultThenable);
  const [myAccessThenable] = useQuery(convexQuery(api.coParents.myAccess), loaderData.myAccess);
  const myAccess = use(myAccessThenable);

  const completeOnboardingStep = useCompleteOnboardingStep();
  const share = useBabyShareOverlayLinks(params.publicId);
  const post = useBabyPostOverlayLinks(params.publicId);
  const settings = useBabySettingsOverlayLinks(params.publicId);
  const login = useBabyLoginOverlayLinks(params.publicId);
  const signup = useBabySignupOverlayLinks(params.publicId);

  const canManage = myAccess.canManage;
  const signedIn = me !== null || canManage;
  const signInButton = signedIn ? null : login.openLink;
  const dashboardButton = signedIn ? { to: "/dashboard" as const } : null;
  const managerBabyDoc = managerBabyResult === FORBIDDEN ? null : managerBabyResult;
  const managerBaby = managerBabyDoc ? managerDocToBabyData(managerBabyDoc) : null;
  const birthJourney = managerBabyDoc?.birthJourney ?? null;

  const currentStatus = getCurrentStatus(baby);

  return (
    <div className="min-h-screen bg-background bg-dots" data-baby-theme={babyDoc.theme ?? "mango"}>
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-auto max-w-sm flex-col gap-2 sm:inset-x-auto sm:right-4 sm:left-auto sm:mx-0">
        {canManage && birthJourney && managerBaby ? (
          <ScheduledNotificationToast
            notifications={loaderData.scheduledNotifications}
            subscriptionCount={loaderData.subscriptionCount}
          />
        ) : null}
      </div>

      {canManage && birthJourney && managerBaby ? (
        <OnboardingHost
          enabled={undefined}
          onboarding={loaderData.onboarding}
          spotlight={
            !shareOpen &&
            !postUpdateOpen &&
            !settingsOpen &&
            !photoOpen &&
            !loginOpen &&
            !signupOpen
          }
          surface="baby"
        />
      ) : null}

      {/* Page chrome: brand pill left, action dock right. Scrolls with the page. */}
      <header className="px-4 pt-3 pb-1">
        <div className="mx-auto flex max-w-6xl min-w-0 items-center justify-between gap-2">
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
            dashboardButton={dashboardButton}
            onDismissPostUpdate={canManage && postUpdateOpen ? post.dismiss : null}
            onDismissSettings={canManage && settingsOpen ? settings.dismiss : null}
            onDismissShare={shareOpen ? share.dismiss : null}
            onDismissSignIn={loginOpen ? login.dismiss : signupOpen ? signup.dismiss : null}
            onSettingsOpened={
              canManage
                ? () => {
                    void completeOnboardingStep({ stepId: "explore_settings" });
                  }
                : null
            }
            postUpdateButton={canManage ? post.openLink : null}
            postUpdateOpen={postUpdateOpen}
            settingsButton={canManage ? settings.openLink : null}
            settingsOpen={settingsOpen}
            shareButton={share.openLink}
            shareOpen={shareOpen}
            signInButton={signInButton}
            signInOpen={loginOpen || signupOpen}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16">
        <h1 className="px-2 pt-10 pb-10 text-center text-4xl font-black tracking-tight text-foreground text-balance md:pt-14 md:text-6xl">
          {t("Is {{name}} out yet?", { name: baby.name })}
        </h1>

        {/* Split layout: sticky status card on the left, feed on the right.
            No internal scroll on the card — that steals wheel/trackpad from the page. */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <section
            className="overflow-x-clip rounded-[2rem] border-2 border-border bg-card px-5 pb-6 text-center pop-shadow-strong md:px-7 lg:sticky lg:top-4"
            data-theme-slot="card"
          >
            <StatusDisplay
              baby={baby}
              blurDataUrl={babyDoc.blurDataUrl ?? null}
              currentStatus={currentStatus}
              latestUpdate={
                latestUpdate
                  ? {
                      message: latestUpdate.update.message ?? null,
                      postedAt: latestUpdate.postedAt,
                    }
                  : null
              }
              photoUrl={babyDoc.photoUrl}
              publicId={babyDoc.publicId}
              thumbnailUrl={babyDoc.thumbnailUrl}
            />
            <div className="flex flex-col items-center">
              <NotificationSubscribe
                audience={canManage ? "manager" : "visitor"}
                babyId={babyDoc._id}
                browserPush={loaderData.browserPush}
                vapidPublicKey={loaderData.vapidPublicKey}
              />
            </div>
            <div className="mt-4">
              <ProgressIndicator baby={baby} currentStatus={currentStatus} />
            </div>
          </section>

          {/* Timeline: owner updates interleaved with encouragements. The
              visitor's encouragement form sits above the feed so nobody has
              to scroll past every message to post; the owner posts via the
              "Post update" button in the dock. Notification clicks land on
              #feed — the messages list, not the compose box. */}
          <div className="space-y-8">
            <section
              className="rounded-[2rem] border-2 border-secondary/60 bg-[color-mix(in_oklab,var(--secondary)_15%,var(--background))] p-6 pop-shadow md:p-8"
              data-theme-slot="card"
              data-tour-id="learn_encouragements"
            >
              <EncouragementForm
                accountName={me?.name ?? null}
                babyId={babyDoc._id}
                babyName={baby.name}
              />
            </section>

            <section
              className="rounded-[2rem] border-2 border-border bg-card px-4 py-6 pop-shadow sm:p-6 md:p-8"
              data-theme-slot="card"
              id={BABY_FEED_HASH}
            >
              <TimelineFeed
                baby={baby}
                babyName={baby.name}
                highlightedItemId={loaderDeps.item}
                isOwner={canManage}
                publicId={babyDoc.publicId}
                timeline={loaderData.timeline}
                visitorTag={loaderData.visitorTag}
              />
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t-2 border-border/60 bg-background/60 py-8 text-center">
        <Link
          className="inline-flex items-center gap-1 px-6 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          to="/"
        >
          {t("Having a baby? Are people messaging you non-stop? Create your own page →")}
        </Link>
      </footer>

      <Outlet />
    </div>
  );
}
