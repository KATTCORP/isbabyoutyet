import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";

const mocks = vi.hoisted(() => ({
  useSuspenseQuery: vi.fn<() => { data: unknown }>(),
  useSession: vi.fn<() => { data: { user: { id: string } } | null; isPending: boolean }>(),
  dismissWelcome: vi.fn<() => void>(),
  setMinimized: vi.fn<() => void>(),
  dismissChecklist: vi.fn<() => void>(),
  completeStep: vi.fn<() => void>(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => mocks.useSession(),
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: () => mocks.useSuspenseQuery(),
  };
});

vi.mock("convex/react", () => ({
  useMutation: (() => {
    let call = 0;
    return () => {
      const index = call;
      call += 1;
      if (index % 4 === 0) return mocks.dismissWelcome;
      if (index % 4 === 1) return mocks.setMinimized;
      if (index % 4 === 2) return mocks.dismissChecklist;
      return mocks.completeStep;
    };
  })(),
}));

vi.mock("./welcome-tour", () => ({
  WelcomeTourDialog: () => null,
}));

vi.mock("./getting-started", () => ({
  GettingStartedCard: () => <div data-testid="getting-started" />,
}));

vi.mock("./coachmark", () => ({
  Coachmark: () => null,
}));

const { OnboardingHost } = await import("./onboarding-host");
const { testPreloadedConvexQuery } = await import("@workspace/convex-prefetch/test-helpers");
const { api } = await import("@baby-outlet/backend/convex/_generated/api");

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

const progress = {
  welcomeDismissed: true,
  checklistDismissed: false,
  minimized: false,
  completedSteps: [] as string[],
  hasBaby: true,
  hasUpdate: false,
  effectiveSteps: ["add_baby"],
  allDone: false,
  tourBaby: { publicId: "baby-smith", name: "Smith" },
};

const onboardingHandle = testPreloadedConvexQuery<typeof api.onboarding.getMine>({
  input: {},
  initialData: progress,
});

test("returns null for anonymous visitors", async () => {
  mocks.useSession.mockReturnValue({ data: null, isPending: false });

  await using view = renderResource(
    <OnboardingHost
      surface="dashboard"
      onboarding={onboardingHandle}
      enabled={undefined}
      spotlight={undefined}
      babyPublicId={undefined}
      onGoToStep={undefined}
    />,
  );

  expect(view.container.firstChild).toBeNull();
});

test("mounts authed onboarding host when progress is loaded", async () => {
  mocks.useSession.mockReturnValue({
    data: { user: { id: "user-1" } },
    isPending: false,
  });
  mocks.useSuspenseQuery.mockReturnValue({ data: progress });

  await using view = renderResource(
    <OnboardingHost
      surface="dashboard"
      onboarding={onboardingHandle}
      enabled={undefined}
      spotlight={undefined}
      babyPublicId={undefined}
      onGoToStep={undefined}
    />,
  );

  expect(view.getByTestId("getting-started")).toBeTruthy();
});

test("renders on the tour baby page when babyPublicId matches", async () => {
  mocks.useSession.mockReturnValue({
    data: { user: { id: "user-1" } },
    isPending: false,
  });
  mocks.useSuspenseQuery.mockReturnValue({ data: progress });

  await using view = renderResource(
    <OnboardingHost
      surface="baby"
      onboarding={onboardingHandle}
      enabled={undefined}
      spotlight={undefined}
      babyPublicId="baby-smith"
      onGoToStep={undefined}
    />,
  );

  expect(view.getByTestId("getting-started")).toBeTruthy();
});
