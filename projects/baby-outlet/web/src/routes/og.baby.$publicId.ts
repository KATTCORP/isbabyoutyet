import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { createBabyOgImage } from "@/lib/og-image";

export const Route = createFileRoute("/og/baby/$publicId")({
  server: {
    handlers: {
      GET: async (opts) => {
        const convexUrl = import.meta.env.VITE_CONVEX_URL;
        if (!convexUrl) {
          return new Response("VITE_CONVEX_URL not set", { status: 500 });
        }

        const client = new ConvexHttpClient(convexUrl);
        const baby = await client.query(api.baby.getByPublicId, {
          id: opts.params.publicId,
        });

        if (!baby) {
          return new Response("Baby not found", { status: 404 });
        }

        return createBabyOgImage({
          name: baby.name,
          ...(baby.dueDateDisplayMode === "exact"
            ? { dueDateDisplayMode: "exact" as const, dueDate: baby.dueDate }
            : {
                dueDateDisplayMode: "message" as const,
                publicDueDateText: baby.publicDueDateText,
              }),
          theme: baby.theme,
          locale: baby.resolvedLocale,
          babyBorn: baby.babyBorn,
          wentToHospital: baby.wentToHospital,
          laborStarted: baby.laborStarted,
          milestoneVisibility: baby.milestoneVisibility,
          photoUrl: baby.photoUrl ?? baby.thumbnailUrl ?? null,
        });
      },
    },
  },
});
