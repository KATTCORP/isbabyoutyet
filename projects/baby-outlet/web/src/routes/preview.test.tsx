import { fireEvent, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import type {
  BabyUpdateHandler,
  MilestoneRedateHandler,
  MilestoneRemoveHandler,
} from "@baby-outlet/backend/src/types";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => void>(),
  head: null as
    | null
    | ((options: { match: { context: { locale: "en-GB" } } }) => { meta: unknown[] }),
  search: {
    name: "Nova",
    dueDate: "2026-09-01T00:00:00.000Z",
    laborStarted: "2026-08-10T08:00:00.000Z",
    wentToHospital: null as string | null,
    babyBorn: null as string | null,
    laborStartedMessage: "It has begun!",
    babyBornMessage: null as string | null,
    settings: true,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: {
      head: (options: { match: { context: { locale: "en-GB" } } }) => { meta: unknown[] };
    }) => {
      mocks.head = options.head;
      return {
        ...options,
        fullPath: "/preview",
        useSearch: () => mocks.search,
      };
    },
  Link: (props: { children: ReactNode }) => <a href="/">{props.children}</a>,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/components/baby/baby-nav", () => ({
  BabyNav: () => null,
}));

vi.mock("@/components/baby/progress-indicator", () => ({
  ProgressIndicator: () => null,
}));

vi.mock("@/components/baby/status-display", () => ({
  StatusDisplay: () => null,
}));

vi.mock("@/components/baby/settings-panel", () => ({
  SettingsPanel: (props: {
    onUpdate: BabyUpdateHandler;
    onMilestoneRedate: MilestoneRedateHandler;
    onMilestoneRemove: MilestoneRemoveHandler;
  }) => (
    <>
      <button type="button" onClick={() => props.onUpdate({ name: "Nova Rae" })}>
        update settings
      </button>
      <button
        type="button"
        onClick={() => props.onMilestoneRedate("gone_to_hospital", "2026-08-10T12:00:00.000Z")}
      >
        redate milestone
      </button>
      <button type="button" onClick={() => props.onMilestoneRemove("labor_started")}>
        remove milestone
      </button>
    </>
  ),
}));

const { PreviewPage } = await import("./preview");

function renderResource(ui: ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("preview routes settings and milestone edits to separate search updates", async () => {
  await using view = renderResource(
    <LocaleProvider locale="en-GB">
      <PreviewPage />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "update settings" }));
  fireEvent.click(view.getByRole("button", { name: "redate milestone" }));
  fireEvent.click(view.getByRole("button", { name: "remove milestone" }));

  expect(mocks.navigate).toHaveBeenNthCalledWith(1, {
    search: { ...mocks.search, name: "Nova Rae" },
    replace: true,
  });
  expect(mocks.navigate).toHaveBeenNthCalledWith(2, {
    search: {
      ...mocks.search,
      wentToHospital: "2026-08-10T12:00:00.000Z",
    },
    replace: true,
  });
  expect(mocks.navigate).toHaveBeenNthCalledWith(3, {
    search: { ...mocks.search, laborStarted: null },
    replace: true,
  });
});

test("preview derives a born status from its search dates", async () => {
  mocks.search.babyBorn = "2026-08-11T03:00:00.000Z";
  mocks.search.babyBornMessage = "She's here!";

  await using view = renderResource(
    <LocaleProvider locale="en-GB">
      <PreviewPage />
    </LocaleProvider>,
  );

  expect(view.getByRole("heading", { name: "Is Nova out yet?" })).toBeTruthy();
  mocks.search.babyBorn = null;
  mocks.search.babyBornMessage = null;
});

test("preview still supplies localized no-index metadata after the schema cutover", () => {
  const result = mocks.head?.({
    match: { context: { locale: "en-GB" } },
  });
  expect(result?.meta.length).toBeGreaterThan(2);
});
