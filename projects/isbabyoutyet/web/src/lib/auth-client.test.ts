import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";
import { TIME_ZONE_HINT_HEADER } from "@isbabyoutyet/backend/src/timeZone";
import { VISITOR_ID_HINT_HEADER } from "@isbabyoutyet/backend/src/visitorId";
import {
  clearClientToken,
  getBrowserAuthHeaders,
  setClientToken,
  waitForMe,
} from "@/lib/auth-client";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { stubQueryClientResource } from "@/test/stubQueryClient";

const signedInProfile = {
  email: "ada@example.com",
  emailVerified: true,
  isAdmin: false,
  locale: "en-GB",
  name: "Ada",
  timeZone: "Europe/London",
} as const;

function makeClients() {
  const setAuth =
    vi.fn<(fetchToken: (opts: { forceRefreshToken: boolean }) => Promise<string | null>) => void>();
  const convexClient = { setAuth };
  const stub = stubQueryClientResource(async () => null);
  return Object.assign(stub, { convexClient, setAuth });
}

test("getBrowserAuthHeaders includes the stored visitor id when present", () => {
  localStorage.setItem("encouragement-visitor-id", "visitor-from-guestbook");
  try {
    const headers = getBrowserAuthHeaders();
    expect(VISITOR_ID_HINT_HEADER in headers).toBe(true);
    if (VISITOR_ID_HINT_HEADER in headers) {
      expect(headers[VISITOR_ID_HINT_HEADER]).toBe("visitor-from-guestbook");
    }
    expect(TIME_ZONE_HINT_HEADER in headers).toBe(true);
  } finally {
    localStorage.removeItem("encouragement-visitor-id");
  }
});

test("getBrowserAuthHeaders omits visitor id when none is stored", () => {
  localStorage.removeItem("encouragement-visitor-id");
  const headers = getBrowserAuthHeaders();
  expect(VISITOR_ID_HINT_HEADER in headers).toBe(false);
});

/** A Convex backend whose `profile.get` answers with `serverProfile.current`. */
function profileBackendResource(initial: typeof signedInProfile | null) {
  const serverProfile = { current: initial };
  const stub = stubQueryClientResource(async (query) => {
    if (getFunctionName(query) === getFunctionName(api.profile.get)) {
      return serverProfile.current;
    }
    throw new Error(`unexpected query ${getFunctionName(query)}`);
  });
  stub.queryClient.setData(convexQuery(api.baby.listByUser), {}, []);
  return Object.assign(stub, { serverProfile });
}

test("waitForMe watches me itself and drops the rest of the cache when present", async () => {
  await using clients = profileBackendResource(signedInProfile);

  await waitForMe({
    convexClient: clients.backend.client,
    presence: "present",
    queryClient: clients.queryClient,
  });

  expect(clients.queryClient.getData(convexQuery(api.profile.get), {})).toEqual(signedInProfile);
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toBeUndefined();
});

test("waitForMe keeps me and drops the rest of the cache when absent", async () => {
  await using clients = profileBackendResource(null);

  await waitForMe({
    convexClient: clients.backend.client,
    presence: "absent",
    queryClient: clients.queryClient,
  });

  expect(clients.queryClient.getData(convexQuery(api.profile.get), {})).toBeNull();
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toBeUndefined();
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
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toEqual([]);

  clients.serverProfile.current = signedInProfile;
  await clients.backend.refresh();
  await waiting;

  expect(clients.queryClient.getData(convexQuery(api.profile.get), {})).toEqual(signedInProfile);
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toBeUndefined();
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
