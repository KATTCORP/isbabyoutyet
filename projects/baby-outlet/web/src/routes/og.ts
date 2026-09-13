import { createFileRoute } from "@tanstack/react-router";
import { createHomepageOgImage } from "@/lib/og-image";
import { detectLocaleFromRequestHeaders } from "@/lib/locale-request-handler";

export const Route = createFileRoute("/og")({
  server: {
    handlers: {
      GET: async () => {
        const locale = detectLocaleFromRequestHeaders();
        return createHomepageOgImage(locale);
      },
    },
  },
});
