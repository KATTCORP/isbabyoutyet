import { createFileRoute } from "@tanstack/react-router";
import { robotsTxt } from "@/lib/robots";
import { withPublicCache } from "@/lib/cachePolicy";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        withPublicCache(
          new Response(robotsTxt(), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          }),
          { maxAgeSeconds: 3600, tags: ["discovery"] },
        ),
    },
  },
});
