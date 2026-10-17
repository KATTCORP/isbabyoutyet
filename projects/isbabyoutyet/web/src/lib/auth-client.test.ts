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

function seedCachedQueries(
  clients: ReturnType<typeof makeClients>,
  profile: typeof signedInProfile | null,
) {
  clients.queryClient.setData(convexQuery(api.profile.get), {}, profile);
  clients.queryClient.setData(convexQuery(api.baby.listByUser), {}, []);
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

test("waitForMe keeps me and drops the rest of the cache when present", async () => {
  await using clients = makeClients();
  seedCachedQueries(clients, signedInProfile);

  await waitForMe({ presence: "present", queryClient: clients.queryClient });

  expect(clients.queryClient.getData(convexQuery(api.profile.get), {})).toEqual(signedInProfile);
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toBeUndefined();
});

test("waitForMe keeps me and drops the rest of the cache when absent", async () => {
  await using clients = makeClients();
  seedCachedQueries(clients, null);

  await waitForMe({ presence: "absent", queryClient: clients.queryClient });

  expect(clients.queryClient.getData(convexQuery(api.profile.get), {})).toBeNull();
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toBeUndefined();
});

test("waitForMe waits for the new identity to reach the cache", async () => {
  await using clients = makeClients();
  seedCachedQueries(clients, null);
  let settled = false;

  const waiting = waitForMe({ presence: "present", queryClient: clients.queryClient }).then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(clients.queryClient.getData(convexQuery(api.baby.listByUser), {})).toEqual([]);

  clients.queryClient.setData(convexQuery(api.profile.get), {}, signedInProfile);
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
