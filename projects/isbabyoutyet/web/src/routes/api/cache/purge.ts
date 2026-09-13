import { createFileRoute } from "@tanstack/react-router";
import { dangerouslyDeleteByTag } from "@vercel/functions";
import { deriveCachePurgeToken } from "@isbabyoutyet/backend/src/cacheTags";
import { z } from "zod";

const purgeRequestSchema = z.object({
  tags: z.array(z.string().min(1).max(256)).min(1).max(16),
});

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
} as const;

type CachePurgeDeps = {
  deleteByTag: typeof dangerouslyDeleteByTag;
};

/**
 * Cache purge handler. `deps` is injectable for tests so we never need to
 * `vi.mock("@vercel/functions")`.
 */
export async function handleCachePurge(request: Request, deps: CachePurgeDeps) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Cache purge is not configured" },
      {
        headers: PRIVATE_HEADERS,
        status: 503,
      },
    );
  }

  const expectedToken = await deriveCachePurgeToken(secret);
  if (request.headers.get("Authorization") !== `Bearer ${expectedToken}`) {
    return Response.json(
      { error: "Unauthorized" },
      {
        headers: PRIVATE_HEADERS,
        status: 401,
      },
    );
  }

  const parsed = purgeRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid cache purge request" },
      {
        headers: PRIVATE_HEADERS,
        status: 400,
      },
    );
  }

  if (process.env.VERCEL) {
    await deps.deleteByTag(parsed.data.tags, {
      revalidationDeadlineSeconds: 0,
    });
  }

  return Response.json({ purged: true }, { headers: PRIVATE_HEADERS });
}

export const Route = createFileRoute("/api/cache/purge")({
  server: {
    handlers: {
      POST: async (requestContext) => {
        return await handleCachePurge(requestContext.request, {
          deleteByTag: dangerouslyDeleteByTag,
        });
      },
    },
  },
});
