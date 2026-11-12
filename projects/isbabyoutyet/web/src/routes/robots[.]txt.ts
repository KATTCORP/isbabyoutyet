import { createFileRoute } from "@tanstack/react-router";
import { robotsTxt } from "@/lib/robots";
import { untilDeploy, withSharedCache } from "@/lib/cache";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        withSharedCache(
          new Response(robotsTxt(), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          }),
          untilDeploy("everyone"),
        ),
    },
  },
});
