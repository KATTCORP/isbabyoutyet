import { createFileRoute } from "@tanstack/react-router";
import { createHomepageOgImage } from "@/lib/og-image";
import { detectLocaleFromRequestHeaders } from "@/lib/locale-request-handler";
import { withPublicCache } from "@/lib/cachePolicy";

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async () => {
        const locale = detectLocaleFromRequestHeaders();
        return withPublicCache(await createHomepageOgImage(locale), {
          maxAgeSeconds: 86_400,
          tags: ["homepage"],
        });
      },
    },
  },
});
