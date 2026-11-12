import { createServerFn } from "@tanstack/react-start";
import { snapshotReader } from "@workspace/convex-query";
import type { ConvexReader, ConvexSnapshotClient } from "@workspace/convex-query";
import { authServer } from "@/lib/auth-server";

/** The request's Convex token, from its session cookie. `undefined` when signed out. */
export const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await authServer.getToken();
});

/** `ConvexHttpClient`, as far as a request's reads need it. */
interface RequestConvexClient extends ConvexSnapshotClient {
  setAuth(token: string): void;
}

interface RequestConvex {
  /** Reads that wait for the visitor's token first. */
  readonly reader: ConvexReader;
  /** The visitor's token, `null` when signed out. Fetched once per request. */
  readonly token: () => Promise<string | null>;
}

/**
 * One server request's Convex reads. Every read waits for the visitor's
 * token, which is fetched once, by the first read or by `token()`. No route
 * waits for it before its loader starts, so loaders start together.
 */
export function requestConvex(opts: {
  client: RequestConvexClient;
  fetchToken: () => Promise<string | undefined>;
}): RequestConvex {
  const client = opts.client;
  let fetched: Promise<string | null> | undefined;
  const token = () => {
    fetched ??= opts.fetchToken().then((jwt) => {
      if (jwt) {
        client.setAuth(jwt);
      }
      return jwt ?? null;
    });
    return fetched;
  };
  return {
    reader: snapshotReader({
      consistentQuery: async (query, args) => {
        await token();
        return await client.consistentQuery(query, args);
      },
    }),
    token,
  };
}
