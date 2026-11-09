import { createFileRoute, defaultParseSearch } from "@tanstack/react-router";
import { withPublicCache } from "@/lib/cachePolicy";
import { detectLocaleFromRequestHeaders } from "@/lib/locale-request-handler";
import { createBabyOgImage } from "@/lib/og-image";
import { previewBabyFromSearch, previewSearchSchema } from "@/lib/preview-baby";

/**
 * Share card for a preview: `/og` + the preview URL, e.g.
 * `/og/preview?name=Alba&theme=mocha-mousse`. Text follows the visitor's
 * language (cookie, then Accept-Language), as on the page itself.
 */
export const Route = createFileRoute("/og/preview")({
  server: {
    handlers: {
      GET: async (opts) => {
        const parsed = previewSearchSchema.safeParse(
          defaultParseSearch(new URL(opts.request.url).search),
        );
        if (!parsed.success) {
          return new Response("Invalid preview", { status: 400 });
        }
        const locale = detectLocaleFromRequestHeaders();
        const baby = previewBabyFromSearch(parsed.data);
        return withPublicCache(
          await createBabyOgImage({
            name: baby.name,
            ...(baby.dueDateDisplayMode === "exact" && baby.dueDate
              ? { dueDate: baby.dueDate, dueDateDisplayMode: "exact" as const }
              : {
                  dueDateDisplayMode: "message" as const,
                  publicDueDateText: baby.publicDueDateText ?? "",
                }),
            babyBorn: baby.babyBorn,
            laborStarted: baby.laborStarted,
            locale,
            milestoneVisibility: baby.milestoneVisibility,
            photoUrl: null,
            theme: baby.theme,
            timeZone: baby.timeZone,
            wentToHospital: baby.wentToHospital,
          }),
          { maxAgeSeconds: 86_400, tags: ["preview"] },
        );
      },
    },
  },
});
