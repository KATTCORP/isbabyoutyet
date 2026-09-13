import { getThemePrimaryColor } from "@/components/baby/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { translate } from "@/lib/i18n";

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
          name,
          short_name: name,
          id: permanentUrl,
          start_url: permanentUrl,
          scope: "/baby/",
          lang: locale,
          description: translate(locale, "Track {{name}}'s journey – know when baby arrives!", {
            name: baby.name,
          }),
          display: "standalone",
          theme_color: themeColor,
          background_color: "#0f172a",
          icons: [
            {
              src: "/favicon.ico",
              sizes: "64x64 32x32 24x24 16x16",
              type: "image/x-icon",
            },
            {
              src: "/android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "/android-chrome-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        };

        return Response.json(manifest, {
          headers: {
            "Content-Type": "application/manifest+json",
          },
        });
      },
    },
  },
});
