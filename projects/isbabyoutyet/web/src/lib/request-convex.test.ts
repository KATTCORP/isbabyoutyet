import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { requestConvex } from "./request-convex";

type RequestClient = Parameters<typeof requestConvex>[0]["client"];

/** A Convex HTTP client, and what it was asked, in order. */
interface Recording {
  readonly calls: Array<string>;
  readonly client: RequestClient;
}

function recordingClient(): Recording {
  const calls: Array<string> = [];
  const client: RequestClient = {
    consistentQuery: async (query) => {
      calls.push(`query ${getFunctionName(query)}`);
      return null;
    },
    setAuth: (token) => {
      calls.push(`setAuth ${token}`);
    },
  };
  return { calls, client };
}

function read(convex: ReturnType<typeof requestConvex>) {
  return convex.reader.query({
    args: {},
    query: api.profile.get,
    signal: new AbortController().signal,
  });
}

test("a read waits for the request's token and runs signed in", async () => {
  const recording = recordingClient();
  const token = Promise.withResolvers<string | undefined>();
  const convex = requestConvex({ client: recording.client, fetchToken: () => token.promise });

  const profile = read(convex);
  await Promise.resolve();
  expect(recording.calls).toEqual([]);

  token.resolve("cookie-jwt");
  await profile;

  expect(recording.calls).toEqual(["setAuth cookie-jwt", "query profile:get"]);
});

test("the token is fetched once for every read and for the hand-off to the browser", async () => {
  const recording = recordingClient();
  const fetchToken = vi.fn<() => Promise<string | undefined>>(() => Promise.resolve("cookie-jwt"));
  const convex = requestConvex({ client: recording.client, fetchToken });

  await Promise.all([read(convex), read(convex)]);

  expect(await convex.token()).toBe("cookie-jwt");
  expect(fetchToken).toHaveBeenCalledTimes(1);
  expect(recording.calls).toEqual(["setAuth cookie-jwt", "query profile:get", "query profile:get"]);
});

test("signed out, reads run anonymously and the browser gets no token", async () => {
  const recording = recordingClient();
  const convex = requestConvex({
    client: recording.client,
    fetchToken: () => Promise.resolve(undefined),
  });

  await read(convex);

  expect(await convex.token()).toBeNull();
  expect(recording.calls).toEqual(["query profile:get"]);
});

test("a request that reads nothing still hands the browser its token", async () => {
  const recording = recordingClient();
  const convex = requestConvex({
    client: recording.client,
    fetchToken: () => Promise.resolve("cookie-jwt"),
  });

  expect(await convex.token()).toBe("cookie-jwt");
});
