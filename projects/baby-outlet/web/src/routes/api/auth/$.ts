import { createFileRoute } from "@tanstack/react-router";
import { authServer } from "@/lib/auth-server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: (opts) => authServer.handler(opts.request),
      POST: (opts) => authServer.handler(opts.request),
    },
  },
});
