import { getData, setData } from "@raf-query/react";
import type { AuthTokenFetcher } from "convex/browser";
import { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { expect, test, vi } from "vitest";
import { clearBrowserCookies, setBrowserCookie } from "@/test/browserCookies";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { TIME_ZONE_HINT_HEADER } from "@isbabyoutyet/backend/src/timeZone";
import { VISITOR_ID_HINT_HEADER } from "@isbabyoutyet/backend/src/visitorId";
import {
  clearClientToken,
  getBrowserAuthHeaders,
  SessionConvexReactClient,
  SessionExpiredError,
  setClientToken,
  waitForMe,
} from "@/lib/auth-client";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { stubQueryClientResource } from "@/test/stubQueryClient";

type Profile = NonNullable<FunctionReturnType<typeof api.profile.get>>;

const signedInProfile = {
  email: "ada@example.com",
  emailVerified: true,
  isAdmin: false,
  locale: "en-GB",
  name: "Ada",
  timeZone: "Europe/London",
} as const satisfies Profile;

function makeClients() {
  const setAuth =
    vi.fn<(fetchToken: (opts: { forceRefreshToken: boolean }) => Promise<string | null>) => void>();
  const stub = stubQueryClientResource(async () => null);
  return Object.assign(stub, { convexClient: { setAuth }, setAuth });
}

test("getBrowserAuthHeaders includes the stored visitor id when present", () => {
  setBrowserCookie("visitor-id", "visitor-from-guestbook");
  try {
    const headers = getBrowserAuthHeaders();
    expect(VISITOR_ID_HINT_HEADER in headers).toBe(true);
    if (VISITOR_ID_HINT_HEADER in headers) {
      expect(headers[VISITOR_ID_HINT_HEADER]).toBe("visitor-from-guestbook");
    }
    expect(TIME_ZONE_HINT_HEADER in headers).toBe(true);
  } finally {
    clearBrowserCookies();
  }
});

test("getBrowserAuthHeaders omits visitor id when none is stored", () => {
  clearBrowserCookies();
  const headers = getBrowserAuthHeaders();
  expect(VISITOR_ID_HINT_HEADER in headers).toBe(false);
});

/** What the backend's `profile.get` answers with; a test swaps `current`. */
type ServerProfile = {
  current: Profile | null;
};

/** A Convex backend whose `profile.get` answers with `serverProfile.current`. */
function profileBackendResource(initial: typeof signedInProfile | null) {
  const serverProfile: ServerProfile = { current: initial };
  const stub = stubQueryClientResource(async (query) => {
    if (getFunctionName(query) === getFunctionName(api.profile.get)) {
      return serverProfile.current;
    }
    throw new Error(`unexpected query ${getFunctionName(query)}`);
  });
  setData(stub.queryClient, convexQuery(api.baby.listByUser), {}, []);
  return Object.assign(stub, { serverProfile });
}

test("waitForMe watches me itself and drops the rest of the cache when present", async () => {
  await using clients = profileBackendResource(signedInProfile);

  await waitForMe({
    convexClient: clients.backend.client,
    presence: "present",
    queryClient: clients.queryClient,
  });

  expect(getData(clients.queryClient, convexQuery(api.profile.get), {})).toEqual(signedInProfile);
  expect(getData(clients.queryClient, convexQuery(api.baby.listByUser), {})).toBeUndefined();
});

test("waitForMe keeps me and drops the rest of the cache when absent", async () => {
  await using clients = profileBackendResource(null);

  await waitForMe({
    convexClient: clients.backend.client,
    presence: "absent",
    queryClient: clients.queryClient,
  });

  expect(getData(clients.queryClient, convexQuery(api.profile.get), {})).toBeNull();
  expect(getData(clients.queryClient, convexQuery(api.baby.listByUser), {})).toBeUndefined();
});

test("waitForMe waits until Convex answers with the new identity", async () => {
  await using clients = profileBackendResource(null);
  let settled = false;

  const waiting = waitForMe({
    convexClient: clients.backend.client,
    presence: "present",
    queryClient: clients.queryClient,
  }).then(() => {
    settled = true;
  });
  await vi.waitFor(() => {
    expect(clients.backend.subscriptions()).toHaveLength(1);
  });
  await clients.backend.refresh();
  expect(settled).toBe(false);
  expect(getData(clients.queryClient, convexQuery(api.baby.listByUser), {})).toEqual([]);

  clients.serverProfile.current = signedInProfile;
  await clients.backend.refresh();
  await waiting;

  expect(getData(clients.queryClient, convexQuery(api.profile.get), {})).toEqual(signedInProfile);
  expect(getData(clients.queryClient, convexQuery(api.baby.listByUser), {})).toBeUndefined();
});

test("setClientToken hands the inline JWT to Convex without a token round trip", async () => {
  await using clients = makeClients();

  // @ts-expect-error — stand-in only implements setAuth
  setClientToken(clients.convexClient, "jwt-from-sign-in");

  const fetchToken = clients.setAuth.mock.lastCall?.[0];
  if (!fetchToken) {
    throw new Error("expected setAuth to receive a token fetcher");
  }
  expect(await fetchToken({ forceRefreshToken: false })).toBe("jwt-from-sign-in");
});

test("clearClientToken drops the identity on the live socket instead of re-running setAuth", () => {
  const clearAuth = vi.fn();
  const setAuth = vi.fn();

  // @ts-expect-error — stand-in only implements clearAuth / setAuth
  clearClientToken({ clearAuth, setAuth });

  expect(clearAuth).toHaveBeenCalledTimes(1);
  expect(setAuth).not.toHaveBeenCalled();
});

/**
 * Stands in for `/convex/token`: each request stays pending until `respond`
 * answers it with a token, or with `null` for the 401 a missing session gets.
 */
type TokenEndpoint = {
  /** Answers the oldest request once the auth client has sent it. */
  respond: (token: string | null) => Promise<void>;
};

function tokenEndpointResource() {
  const waiting: Array<(response: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          waiting.push(resolve);
        }),
    ),
  );
  const endpoint: TokenEndpoint = {
    async respond(token) {
      const resolve = await vi.waitFor(() => {
        const next = waiting.shift();
        if (!next) {
          throw new Error("no pending /convex/token request");
        }
        return next;
      });
      resolve(
        token === null
          ? Response.json({ message: "Unauthorized" }, { status: 401 })
          : Response.json({ token }),
      );
    },
  };
  return makeResource(endpoint, () => {
    vi.unstubAllGlobals();
  });
}

/**
 * A real `SessionConvexReactClient` without a socket: Convex's own `setAuth`
 * only records the token fetcher it would call, and whatever the client sends
 * runs on the in-memory backend as the harness's current caller.
 */
function sessionClientResource(harness: ConvexTestHarness) {
  const convexClient = new SessionConvexReactClient("https://session-test.convex.cloud");
  const setAuth = vi.spyOn(ConvexReactClient.prototype, "setAuth").mockImplementation(() => {});
  const clearAuth = vi.spyOn(ConvexReactClient.prototype, "clearAuth").mockImplementation(() => {});
  const send = vi
    .spyOn(ConvexReactClient.prototype, "mutation")
    .mockImplementation(async (reference, ...argsAndOptions) =>
      harness.convexClient.mutation(
        // SAFETY: the integration client takes the same references, typed as public ones.
        reference as FunctionReference<"mutation">,
        argsAndOptions[0],
      ),
    );
  const fetchToken: AuthTokenFetcher = (opts) => {
    const latest = setAuth.mock.lastCall?.[0];
    if (!latest) {
      throw new Error("expected setAuth to receive a token fetcher");
    }
    return latest(opts);
  };
  return makeResource(
    {
      clearAuth,
      convexClient,
      /** Calls the fetcher from the latest `setAuth`, as Convex would. */
      fetchToken,
      send,
    },
    () => {
      setAuth.mockRestore();
      clearAuth.mockRestore();
      send.mockRestore();
    },
  );
}

async function signedInHarness() {
  const harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  await harness.withIdentity({ subject: userId });
  return Object.assign(harness, { userId });
}

test("a mutation made while an expired session refreshes is rejected instead of running anonymously", async () => {
  await using harness = await signedInHarness();
  using endpoint = tokenEndpointResource();
  using client = sessionClientResource(harness);
  setClientToken(client.convexClient, "jwt-from-ssr");
  // Convex first authenticates with the token it was handed.
  expect(await client.fetchToken({ forceRefreshToken: false })).toBe("jwt-from-ssr");

  // Convex refetches the token, but the session cookie has expired.
  const refreshing = client.fetchToken({ forceRefreshToken: true });
  const saving = client.convexClient.mutation(api.profile.updateLocale, { locale: "sv" });
  expect(client.send).not.toHaveBeenCalled();

  // With no token, Convex drops to anonymous and resends what it queued.
  await harness.withIdentity(null);
  await endpoint.respond(null);
  expect(await refreshing).toBeNull();

  await expect(saving).rejects.toBeInstanceOf(SessionExpiredError);
  await expect(saving).rejects.toThrow("Your session has expired. Please sign in again.");
  await expect(
    client.convexClient.mutation(api.profile.updateTimeZone, { timeZone: "Europe/Stockholm" }),
  ).rejects.toBeInstanceOf(SessionExpiredError);
  expect(client.send).not.toHaveBeenCalled();
  // What the server would have answered (PERSONAL-ISBABYOUTYET-6).
  await expect(harness.client.mutation(api.profile.updateLocale, { locale: "sv" })).rejects.toThrow(
    "Not authenticated",
  );

  // Signing in again starts a new session.
  await harness.withIdentity({ subject: harness.userId });
  setClientToken(client.convexClient, "jwt-from-sign-in");
  await client.convexClient.mutation(api.profile.updateLocale, { locale: "sv" });
  expect((await harness.client.query(api.profile.get, {}))?.locale).toBe("sv");
});

test("a mutation made during a successful token refresh waits for it, then runs signed in", async () => {
  await using harness = await signedInHarness();
  using endpoint = tokenEndpointResource();
  using client = sessionClientResource(harness);
  setClientToken(client.convexClient, "jwt-from-ssr");
  // Convex first authenticates with the token it was handed.
  expect(await client.fetchToken({ forceRefreshToken: false })).toBe("jwt-from-ssr");

  const refreshing = client.fetchToken({ forceRefreshToken: true });
  const saving = client.convexClient.mutation(api.profile.updateLocale, { locale: "es" });
  expect(client.send).not.toHaveBeenCalled();

  await endpoint.respond("fresh-jwt");
  expect(await refreshing).toBe("fresh-jwt");
  await saving;

  expect(client.send).toHaveBeenCalledTimes(1);
  expect((await harness.client.query(api.profile.get, {}))?.locale).toBe("es");
});

test("anonymous visitors and signed-out users still reach the server", async () => {
  await using harness = await signedInHarness();
  using endpoint = tokenEndpointResource();
  using client = sessionClientResource(harness);
  await harness.withIdentity(null);

  // An anonymous visitor's token check answers 401, but no session was lost.
  setClientToken(client.convexClient, null);
  const checking = client.fetchToken({ forceRefreshToken: false });
  const anonymousCall = client.convexClient.mutation(api.profile.updateLocale, { locale: "sv" });
  await endpoint.respond(null);
  expect(await checking).toBeNull();
  await expect(anonymousCall).rejects.toThrow("Not authenticated");
  expect(client.send).toHaveBeenCalledTimes(1);

  // After a lost session, an explicit sign-out lets calls go out anonymously again.
  setClientToken(client.convexClient, "jwt-from-ssr");
  // Convex first authenticates with the token it was handed.
  expect(await client.fetchToken({ forceRefreshToken: false })).toBe("jwt-from-ssr");
  const refreshing = client.fetchToken({ forceRefreshToken: true });
  await endpoint.respond(null);
  await refreshing;
  clearClientToken(client.convexClient);
  expect(client.clearAuth).toHaveBeenCalledTimes(1);
  await expect(
    client.convexClient.mutation(api.profile.updateLocale, { locale: "sv" }),
  ).rejects.toThrow("Not authenticated");
  expect(client.send).toHaveBeenCalledTimes(2);
});
