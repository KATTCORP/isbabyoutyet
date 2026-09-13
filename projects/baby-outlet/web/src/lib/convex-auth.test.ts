import { QueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";

type SessionSnapshot = { data: unknown; isPending: boolean };
type SessionListener = (session: SessionSnapshot | undefined) => void;

const authStub = vi.hoisted(() => {
  const state = {
    tokenResult: null as { data: { token: string } | null } | null,
    tokenError: false,
    listeners: [] as SessionListener[],
  };
  return {
    state,
    authClient: {
      convex: {
        token: () => {
          if (state.tokenError) {
            return Promise.reject(new Error("token endpoint down"));
          }
          return Promise.resolve(state.tokenResult);
        },
      },
      $store: {
        atoms: {
          session: {
            subscribe: (listener: SessionListener) => {
              state.listeners.push(listener);
              return () => {};
            },
          },
        },
      },
    },
  };
});

vi.mock("@/lib/auth-client", () => ({ authClient: authStub.authClient }));

const { setupClientConvexAuth } = await import("@/lib/convex-auth");

const profileKey = convexQuery(api.profile.get, {}).queryKey;

function makeClients() {
  const setAuth = vi.fn<(fetchToken: () => Promise<string | null>) => void>();
  const convexQueryClient = { convexClient: { setAuth } };
  const queryClient = new QueryClient();
  return { setAuth, convexQueryClient, queryClient };
}

function emitSession(session: SessionSnapshot) {
  for (const listener of authStub.state.listeners) {
    listener(session);
  }
}

test("setup establishes auth immediately: token for signed-in, null for anonymous", async () => {
  const clients = makeClients();
  setupClientConvexAuth(clients.convexQueryClient as never, clients.queryClient);

  expect(clients.setAuth).toHaveBeenCalledTimes(1);
  const fetchToken = clients.setAuth.mock.calls[0]?.[0];
  if (!fetchToken) {
    throw new Error("expected a token fetcher");
  }

  authStub.state.tokenResult = { data: { token: "jwt" } };
  expect(await fetchToken()).toBe("jwt");

  // Anonymous: the token endpoint has no session — resolve as unauthenticated
  // instead of hanging the expectAuth-paused socket.
  authStub.state.tokenResult = { data: null };
  expect(await fetchToken()).toBeNull();

  // Endpoint failures must not throw out of the fetcher either.
  authStub.state.tokenError = true;
  expect(await fetchToken()).toBeNull();
  authStub.state.tokenError = false;
});

test("setup tolerates a missing session atom", async () => {
  const clients = makeClients();
  const atoms = authStub.authClient.$store.atoms as Record<string, unknown>;
  const sessionAtom = atoms.session;
  atoms.session = undefined;
  await using _restore = makeResource({}, () => {
    atoms.session = sessionAtom;
  });

  setupClientConvexAuth(clients.convexQueryClient as never, clients.queryClient);

  expect(clients.setAuth).toHaveBeenCalledTimes(1);
});

test("a session resolving to none clears the cached profile; pending or signed-in leaves it", () => {
  const clients = makeClients();
  setupClientConvexAuth(clients.convexQueryClient as never, clients.queryClient);
  clients.queryClient.setQueryData(profileKey, { locale: "sv", isAdmin: false });

  emitSession({ data: null, isPending: true });
  expect(clients.queryClient.getQueryData(profileKey)).not.toBeNull();

  emitSession({ data: { session: { id: "s1" } }, isPending: false });
  expect(clients.queryClient.getQueryData(profileKey)).not.toBeNull();

  // Session expired (noticed by the store): the /_auth guard's session
  // signal must go null so the next navigation re-checks the token.
  emitSession({ data: null, isPending: false });
  expect(clients.queryClient.getQueryData(profileKey)).toBeNull();
});
