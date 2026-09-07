import { QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@workspace/convex/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { TIME_ZONE_HINT_HEADER } from "@workspace/convex/src/timeZone";
import { VISITOR_ID_HINT_HEADER } from "@workspace/convex/src/visitorId";
import {
  clearClientToken,
  getBrowserAuthHeaders,
  setClientToken,
  waitForMe,
} from "@/lib/auth-client";

const profileKey = convexQuery(api.profile.get, {}).queryKey;
const babyListKey = convexQuery(api.baby.listByUser, {}).queryKey;

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
  const queryOptions = vi.fn(() => ({
    queryFn: async () => null,
    queryKey: profileKey,
    staleTime: Infinity,
  }));
  const convexClient = { setAuth };
  const convexQueryClient = {
    queryOptions,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { convexClient, convexQueryClient, queryClient, setAuth };
}

function seedCachedQueries(queryClient: QueryClient, profile: typeof signedInProfile | null) {
  queryClient.setQueryData(profileKey, profile);
  queryClient.setQueryData(babyListKey, []);
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
  const clients = makeClients();
  seedCachedQueries(clients.queryClient, signedInProfile);

  await waitForMe({
    // @ts-expect-error — stand-in only implements queryOptions
    convexQueryClient: clients.convexQueryClient,
    presence: "present",
    queryClient: clients.queryClient,
  });

  expect(clients.queryClient.getQueryData(profileKey)).toEqual(signedInProfile);
  expect(clients.queryClient.getQueryData(babyListKey)).toBeUndefined();
});

test("waitForMe keeps me and drops the rest of the cache when absent", async () => {
  const clients = makeClients();
  seedCachedQueries(clients.queryClient, null);

  await waitForMe({
    // @ts-expect-error — stand-in only implements queryOptions
    convexQueryClient: clients.convexQueryClient,
    presence: "absent",
    queryClient: clients.queryClient,
  });

  expect(clients.queryClient.getQueryData(profileKey)).toBeNull();
  expect(clients.queryClient.getQueryData(babyListKey)).toBeUndefined();
});

test("setClientToken hands the inline JWT to Convex without a token round trip", async () => {
  const clients = makeClients();

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
