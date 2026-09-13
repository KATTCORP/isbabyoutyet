import { getThemePrimaryColor } from "@/components/baby/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { translate } from "@/lib/i18n";
import { withPublicCache } from "@/lib/cachePolicy";
import { ALL_BABY_PAGES_CACHE_TAG, babyIdCacheTag } from "@isbabyoutyet/backend/src/cacheTags";

export const Route = createFileRoute("/baby/manifest/$_id")({
  server: {
    handlers: {
      GET: async (opts) => {
        const convexUrl = import.meta.env.VITE_CONVEX_URL;
        if (!convexUrl) {
          return new Response("VITE_CONVEX_URL not set", { status: 500 });
        }

        const client = new ConvexHttpClient(convexUrl);
        const baby = await client.query(api.baby.getByPublicId, {
          id: opts.params._id,
        });

        if (!baby) {
          return new Response("Baby not found", { status: 404 });
        }

        const locale = baby.resolvedLocale;
        const name = translate(locale, "Is {{name}} out yet?", { name: baby.name });
        const themeColor = getThemePrimaryColor(baby.theme);
        const permanentUrl = `/baby/${baby._id}`;

        const manifest = {
          background_color: "#0f172a",
          description: translate(locale, "Track {{name}}'s journey – know when baby arrives!", {
            name: baby.name,
          }),
          display: "standalone",
          icons: [
            {
              sizes: "64x64 32x32 24x24 16x16",
              src: "/favicon.ico",
              type: "image/x-icon",
            },
            {
              purpose: "any maskable",
              sizes: "192x192",
              src: "/android-chrome-192x192.png",
              type: "image/png",
            },
            {
              purpose: "any maskable",
              sizes: "512x512",
              src: "/android-chrome-512x512.png",
              type: "image/png",
            },
          ],
          id: permanentUrl,
          lang: locale,
          name,
          scope: "/baby/",
          short_name: name,
          start_url: permanentUrl,
          theme_color: themeColor,
        };

        return withPublicCache(
          Response.json(manifest, {
            headers: {
              "Content-Type": "application/manifest+json",
            },
          }),
          {
            maxAgeSeconds: 86_400,
            tags: [ALL_BABY_PAGES_CACHE_TAG, babyIdCacheTag(opts.params._id)],
          },
        );
      },
    },
  },
});
