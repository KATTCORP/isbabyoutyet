import { createFileRoute } from "@tanstack/react-router";
import { CompositeComponent } from "@tanstack/react-start/rsc";
import { api } from "@workspace/convex/convex/_generated/api";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { allKeyed } from "@workspace/query-prefetch";
import { getHomepageRsc } from "@/components/homepage/get-homepage-rsc";
import {
  HomepageAuthHeaderActions,
  HomepageBottomCta,
  HomepageHeroCtas,
  HomepageHeroHeadline,
  HomepageLocalePicker,
  HomepageSeeItInAction,
} from "@/components/homepage/homepage-islands";
import { HomePageView } from "@/components/homepage/homepage-view";
import { homepageCacheHeaders } from "@/lib/cachePolicy";
import { translate, useI18n } from "@/lib/i18n";
import { searchRobotsMeta } from "@/lib/robots";
import { homepageOgImagePath, openGraphImageMeta } from "@/lib/seo";
import { absoluteUrl, canonicalUrl } from "@/lib/site-url";

type HomepageLoaderRsc = Awaited<ReturnType<typeof getHomepageRsc>>;

type HomepageLoaderPayload = {
  src: HomepageLoaderRsc["src"] | null;
};

export const Route = createFileRoute("/")({
  component: HomePage,
  headers: homepageCacheHeaders,
  loader: async (opts) => {
    const locale = opts.context.locale;
    const me = opts.context.convexPreloader.ensureQueryData(api.profile.get, {});
    // Vitest / jsdom has no Start request ALS; keep marketing tests on the
    // client HomePageView. Production SSR and `vite preview` fetch the RSC.
    if (import.meta.env.MODE === "test") {
      const homepage = { src: null } satisfies HomepageLoaderPayload;
      return await allKeyed({
        homepage: Promise.resolve(homepage),
        me,
      });
    }
    return await allKeyed({
      homepage: getHomepageRsc({ data: { locale } }),
      me,
    });
  },
  head: (opts) => {
    const locale = opts.match.context.locale;
    const title = translate(locale, "Is Baby Out Yet? – Share Your Baby's Arrival");
    const description = translate(
      locale,
      "Stop answering 'any news yet?' texts. Create a simple page to keep everyone updated, let them send encouragement, and notify them the moment baby arrives.",
    );
    const imageUrl = absoluteUrl(homepageOgImagePath());
    return {
      links: [{ href: canonicalUrl("/"), rel: "canonical" }],
      meta: [
        {
          title,
        },
        {
          content: description,
          name: "description",
        },
        {
          content: title,
          property: "og:title",
        },
        {
          content: description,
          property: "og:description",
        },
        {
          content: canonicalUrl("/"),
          property: "og:url",
        },
        {
          content: "website",
          property: "og:type",
        },
        ...openGraphImageMeta({ alt: title, imageUrl }),
        {
          content: title,
          name: "twitter:title",
        },
        {
          content: description,
          name: "twitter:description",
        },
        ...searchRobotsMeta({ index: true }),
      ],
    };
  },
});

export function HomePage() {
  const loaderData = Route.useLoaderData();
  const meQuery = usePreloadedConvexQuery(api.profile.get, loaderData.me);
  const isSignedIn = meQuery.data != null;
  const homepageSrc = loaderData.homepage.src;

  if (homepageSrc === null) {
    return <HomePageView isSignedIn={isSignedIn} />;
  }

  return <HomepageRscPage isSignedIn={isSignedIn} src={homepageSrc} />;
}

function HomepageRscPage(props: {
  isSignedIn: boolean;
  src: NonNullable<HomepageLoaderRsc["src"]>;
}) {
  const { t } = useI18n();
  const isSignedIn = props.isSignedIn;

  return (
    <CompositeComponent
      bottomCta={
        <HomepageBottomCta
          body={
            isSignedIn
              ? t("Head back to your dashboard to keep everyone updated.")
              : t(
                  "Join families who've already shared their special moments. Takes less than a minute.",
                )
          }
          buttonLabel={isSignedIn ? t("Go to Dashboard") : t("Get Started Free 🎉")}
          isSignedIn={isSignedIn}
          title={t("Ready to share the journey?")}
        />
      }
      headerActions={
        <HomepageAuthHeaderActions
          dashboardLabel={t("Dashboard")}
          getStartedLabel={t("Get started")}
          isSignedIn={isSignedIn}
          signInLabel={t("Sign in")}
        />
      }
      renderFooterLocale={(data) => (
        <HomepageLocalePicker label={data.languageLabel} locale={data.locale} />
      )}
      renderHeroCtas={(data) => (
        <HomepageHeroCtas
          createPageLabel={t("Create your page 🎈")}
          demoPublicId={data.demoPublicId}
          goToDashboardLabel={t("Go to Dashboard")}
          isSignedIn={isSignedIn}
          seeLivePageLabel={t("See a live page")}
          signInLabel={t("Sign in")}
        />
      )}
      renderHeroHeadline={(data) => (
        <HomepageHeroHeadline after={data.after} before={data.before} words={data.words} />
      )}
      renderSeeItInAction={(data) => <HomepageSeeItInAction {...data} />}
      src={props.src}
    />
  );
}

/**
 * @internal exported for tests
 */
export { HomePageView };
