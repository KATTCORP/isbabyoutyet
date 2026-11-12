import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import {
  babyOgImageFileName,
  babyOgImagePublicIdFromFileName,
  calendarDayKey,
} from "@isbabyoutyet/backend/src/babyOgImage";
import { withImmutableCache } from "@/lib/cache";
import { createBabyOgImage } from "@/lib/og-image";

export const Route = createFileRoute("/og/baby/$publicId")({
  server: {
    handlers: {
      GET: async (opts) => {
        const convexUrl = import.meta.env.VITE_CONVEX_URL;
        if (!convexUrl) {
          return new Response("VITE_CONVEX_URL not set", { status: 500 });
        }

        const requestedFileName = opts.params.publicId;
        const publicId = babyOgImagePublicIdFromFileName(requestedFileName);
        const client = new ConvexHttpClient(convexUrl);
        const baby = await client.query(api.baby.getByPublicId, {
          id: publicId,
        });

        if (!baby) {
          return new Response("Baby not found", { status: 404 });
        }

        const currentFileName = babyOgImageFileName({
          asOfDay: calendarDayKey({ now: Date.now(), timeZone: baby.timeZone }),
          ogImageHash: baby.ogImageHash,
          publicId: baby.publicId,
        });
        if (requestedFileName !== currentFileName) {
          const location = new URL(opts.request.url);
          location.pathname = `/og/baby/${currentFileName}`;
          location.search = "";
          return new Response(null, { headers: { Location: location.toString() }, status: 307 });
        }

        return withImmutableCache(
          await createBabyOgImage({
            name: baby.name,
            ...(baby.dueDateDisplayMode === "exact"
              ? { dueDate: baby.dueDate, dueDateDisplayMode: "exact" as const }
              : {
                  dueDateDisplayMode: "message" as const,
                  publicDueDateText: baby.publicDueDateText ?? "",
                }),
            babyBorn: baby.babyBorn,
            laborStarted: baby.laborStarted,
            locale: baby.resolvedLocale,
            milestoneVisibility: baby.milestoneVisibility,
            photoUrl: baby.photoUrl ?? baby.thumbnailUrl ?? null,
            theme: baby.theme,
            timeZone: baby.timeZone,
            wentToHospital: baby.wentToHospital,
          }),
        );
      },
    },
  },
});
