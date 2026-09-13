import { fireEvent } from "@testing-library/react";
import type { NavigateOptions } from "@tanstack/react-router";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { AddBabyPage, AddBabyPageView, Route, type CreateBaby } from "./dashboard_.add";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { htmlInput } from "@/test/htmlElement";
import { installMatchMediaStub } from "@/test/stubJsdomWindow";

type NavigateFn = (args: NavigateOptions) => Promise<void>;
type SubscribeOwnerMessages = (babyId: Id<"baby">) => Promise<void>;

// SAFETY: Seeded convex-test document id.
const TEST_BABY_ID = "jd7baby000000000000000000" as Id<"baby">;

function createAddBabyMocks() {
  return {
    createBaby: vi.fn<CreateBaby>().mockResolvedValue(
      /* SAFETY: createBaby tests read publicId and babyId from the result. */ {
        babyId: TEST_BABY_ID,
        publicId: "baby-fern",
      } as Awaited<ReturnType<CreateBaby>>,
    ),
    navigate: vi.fn<NavigateFn>().mockResolvedValue(undefined),
    subscribeOwnerMessages: vi.fn<SubscribeOwnerMessages>().mockResolvedValue(undefined),
  };
}

function renderAddBaby(opts: {
  createBaby: CreateBaby | undefined;
  navigate: NavigateFn | undefined;
  subscribeOwnerMessages: SubscribeOwnerMessages | null | undefined;
}) {
  const mocks = createAddBabyMocks();
  return renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <AddBabyPageView
        createBaby={opts.createBaby ?? mocks.createBaby}
        navigate={opts.navigate ?? mocks.navigate}
        subscribeOwnerMessages={opts.subscribeOwnerMessages ?? null}
      />
    </LocaleProvider>,
    { path: "/dashboard/add" },
  );
}

function renderDefaultAddBaby() {
  return renderAddBaby({
    createBaby: undefined,
    navigate: undefined,
    subscribeOwnerMessages: null,
  });
}

function expandOptionalSettings(view: Awaited<ReturnType<typeof renderAddBaby>>) {
  fireEvent.click(view.getByRole("button", { name: "Customize your page (optional)" }));
}

test("add baby remains a standalone non-nested dashboard route", () => {
  expect(Route.options.component).toBe(AddBabyPage);
});

test("optional settings stay collapsed until expanded", async () => {
  await using view = await renderDefaultAddBaby();

  expect(view.getByRole("button", { name: "Customize your page (optional)" })).toBeTruthy();
  expect(view.queryByRole("combobox", { name: "Presets" })).toBeNull();
  expect(view.queryByText("Birth journey")).toBeNull();

  expandOptionalSettings(view);

  expect(
    view.getByText(
      "You can change journey, theme, and other settings anytime after creating your page.",
    ),
  ).toBeTruthy();

  expect(view.getByRole("combobox", { name: "Presets" })).toBeTruthy();
  expect(view.getByText("Birth journey")).toBeTruthy();
  expect(view.getByText("Theme")).toBeTruthy();
});

test("name field explains it can be filled later", async () => {
  await using view = await renderDefaultAddBaby();

  expect(view.getByLabelText("Baby name")).toBeTruthy();
  expect(
    view.getByText("Optional. Leave it blank for now. You can change it later in Settings."),
  ).toBeTruthy();
});

test("journey choices explain visible statuses and privacy", async () => {
  const createBaby = vi.fn<CreateBaby>();
  const navigate = vi.fn<NavigateFn>();
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  expandOptionalSettings(view);

  expect(view.getByRole("combobox", { name: "Presets" }).textContent).toContain("Labour");
  expect(view.getByRole("switch", { name: "Labour started" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(view.getByRole("switch", { name: "Gone to hospital" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  const babyBornSwitch = view.getByRole("switch", { name: "Baby born" });
  expect(
    babyBornSwitch.getAttribute("aria-disabled") ?? babyBornSwitch.getAttribute("disabled"),
  ).not.toBeNull();
  expect(
    view.getByText("Visitors see: Labour started → Gone to hospital → Baby born"),
  ).toBeTruthy();
  expect(
    view.getByText("We save this choice for your settings, but we don't show it to anyone."),
  ).toBeTruthy();
  expect(
    view.getByRole("switch", { name: "Show exact due date" }).getAttribute("aria-checked"),
  ).toBe("true");
  const dueDateSectionLabel = view.container.querySelector("[data-slot='label']");
  expect(dueDateSectionLabel?.textContent).toBe("Due date");
  expect(dueDateSectionLabel?.className).toContain("font-bold");
  expect(
    view.getAllByText("Due date").filter((element) => !element.classList.contains("sr-only")),
  ).toHaveLength(1);
  expect(view.getByLabelText("Due date")).toBeTruthy();
  expect(view.queryByLabelText("Public due date message")).toBeNull();
});

test("submits optional theme selection", async () => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests only read publicId from the result. */ {
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  expandOptionalSettings(view);
  fireEvent.click(view.getByRole("button", { name: "Violet Bloom" }));
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalledWith({
      birthJourney: "labor",
      dueDate: expect.stringContaining("2026-09-09"),
      dueDateDisplayMode: "exact",
      name: "Baby Fern",
      publicDueDateText: null,
      theme: "violet-bloom",
    });
  });
  expect(navigate).toHaveBeenCalledWith({
    params: { publicId: "baby-fern" },
    to: "/baby/$publicId",
  });
});

test.each([
  { birthJourney: "labor", label: "Labour" },
  { birthJourney: "home_birth", label: "Home birth" },
  { birthJourney: "planned_c_section", label: "Planned C-section" },
])("submits the $label selection", async (testCase) => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests only read publicId from the result. */ {
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  expandOptionalSettings(view);
  if (testCase.birthJourney !== "labor") {
    fireEvent.click(view.getByRole("combobox", { name: "Presets" }));
    const option = view.getByRole("option", { name: testCase.label });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
  }
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalledWith({
      birthJourney: testCase.birthJourney,
      dueDate: expect.stringContaining("2026-09-09"),
      dueDateDisplayMode: "exact",
      name: "Baby Fern",
      publicDueDateText: null,
      theme: null,
    });
  });
  expect(navigate).toHaveBeenCalledWith({
    params: { publicId: "baby-fern" },
    to: "/baby/$publicId",
  });
});

test("allows a hidden public due date when message mode has no text", async () => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests only read publicId from the result. */ {
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.click(view.getByRole("switch", { name: "Show exact due date" }));
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalledWith({
      birthJourney: "labor",
      dueDate: null,
      dueDateDisplayMode: "message",
      name: "Baby Fern",
      publicDueDateText: null,
      theme: null,
    });
  });
});

test("submits a custom public due date message when provided", async () => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests only read publicId from the result. */ {
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.click(view.getByRole("switch", { name: "Show exact due date" }));
  const publicMessageInput = htmlInput(view.getByLabelText("Public due date message"));
  fireEvent.change(publicMessageInput, {
    target: { value: "  Any day now  " },
  });
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalledWith({
      birthJourney: "labor",
      dueDate: null,
      dueDateDisplayMode: "message",
      name: "Baby Fern",
      publicDueDateText: "Any day now",
      theme: null,
    });
  });
});

test("toggles exact due date mode when clicking the row label", async () => {
  const createBaby = vi.fn<CreateBaby>();
  const navigate = vi.fn<NavigateFn>();
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  const exactSwitch = view.getByRole("switch", { name: "Show exact due date" });
  expect(exactSwitch.getAttribute("aria-checked")).toBe("true");

  fireEvent.click(view.getByText("Visitors see the exact date and countdown."));
  expect(exactSwitch.getAttribute("aria-checked")).toBe("false");

  fireEvent.click(view.getByText("Show exact due date"));
  expect(exactSwitch.getAttribute("aria-checked")).toBe("true");
});

test("keeps entered date and message values while toggling fields", async () => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests only read publicId from the result. */ {
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages: null });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-19" },
  });
  const exactSwitch = view.getByRole("switch", { name: "Show exact due date" });
  fireEvent.click(exactSwitch);
  fireEvent.change(view.getByLabelText("Public due date message"), {
    target: { value: "Any day now" },
  });
  fireEvent.click(exactSwitch);
  expect(htmlInput(view.getByLabelText("Due date")).value).toBe("2026-09-19");
  fireEvent.click(exactSwitch);
  expect(htmlInput(view.getByLabelText("Public due date message")).value).toBe("Any day now");
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalledWith({
      birthJourney: "labor",
      dueDate: expect.stringContaining("2026-09-19"),
      dueDateDisplayMode: "message",
      name: "Baby Fern",
      publicDueDateText: "Any day now",
      theme: null,
    });
  });
});

test("shows a message-notification switch off by default", async () => {
  await using view = await renderDefaultAddBaby();

  const notifySwitch = view.getByRole("switch", { name: "Message notifications" });
  expect(notifySwitch.getAttribute("aria-checked")).toBe("false");
  expect(view.getByText("Get notified when someone leaves a message")).toBeTruthy();
});

test("subscribes for visitor messages when the switch is on at submit", async () => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests read publicId and babyId from the result. */ {
      babyId: TEST_BABY_ID,
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  const subscribeOwnerMessages = vi.fn<SubscribeOwnerMessages>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  fireEvent.click(view.getByRole("switch", { name: "Message notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalled();
  });
  expect(subscribeOwnerMessages).toHaveBeenCalledWith(TEST_BABY_ID);
  expect(navigate).toHaveBeenCalledWith({
    params: { publicId: "baby-fern" },
    to: "/baby/$publicId",
  });
});

test("does not subscribe for visitor messages when the switch stays off", async () => {
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests read publicId and babyId from the result. */ {
      babyId: TEST_BABY_ID,
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  const subscribeOwnerMessages = vi.fn<SubscribeOwnerMessages>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalled();
  });
  expect(subscribeOwnerMessages).not.toHaveBeenCalled();
});

test("still navigates when message-notification subscribe fails", async () => {
  const toastError = vi.spyOn(toast, "error").mockReturnValue("toast-id");
  await using _restore = makeResource({}, () => {
    toastError.mockRestore();
  });
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests read publicId and babyId from the result. */ {
      babyId: TEST_BABY_ID,
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  const subscribeOwnerMessages = vi
    .fn<SubscribeOwnerMessages>()
    .mockRejectedValue(new Error("Notification permission denied"));
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  fireEvent.click(view.getByRole("switch", { name: "Message notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(subscribeOwnerMessages).toHaveBeenCalledWith(TEST_BABY_ID);
  });
  expect(toastError).toHaveBeenCalledWith("Notification permission denied");
  expect(navigate).toHaveBeenCalledWith({
    params: { publicId: "baby-fern" },
    to: "/baby/$publicId",
  });
});

test("toasts a generic subscribe failure when the error is not an Error", async () => {
  const toastError = vi.spyOn(toast, "error").mockReturnValue("toast-id");
  await using _restore = makeResource({}, () => {
    toastError.mockRestore();
  });
  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests read publicId and babyId from the result. */ {
      babyId: TEST_BABY_ID,
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  const subscribeOwnerMessages = vi.fn<SubscribeOwnerMessages>().mockRejectedValue("nope");
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages });

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  fireEvent.click(view.getByRole("switch", { name: "Message notifications" }));
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("Failed to subscribe to notifications");
  });
  expect(navigate).toHaveBeenCalled();
});

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

test("iOS Safari add-baby omits message notifications and does not subscribe", async () => {
  const restore: Array<() => void> = [];
  const existingUa = Object.getOwnPropertyDescriptor(navigator, "userAgent");
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => IPHONE_SAFARI_UA,
  });
  restore.push(() => {
    if (existingUa) {
      Object.defineProperty(navigator, "userAgent", existingUa);
      return;
    }
    Reflect.deleteProperty(navigator, "userAgent");
  });
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: false,
  });
  restore.push(
    () => {
      Reflect.deleteProperty(navigator, "standalone");
    },
    installMatchMediaStub(() => false),
  );
  await using _ios = makeResource({}, () => {
    for (const fn of restore.toReversed()) {
      fn();
    }
  });

  const createBaby = vi.fn<CreateBaby>().mockResolvedValue(
    /* SAFETY: createBaby tests read publicId and babyId from the result. */ {
      babyId: TEST_BABY_ID,
      publicId: "baby-fern",
    } as Awaited<ReturnType<CreateBaby>>,
  );
  const navigate = vi.fn<NavigateFn>().mockResolvedValue(undefined);
  const subscribeOwnerMessages = vi.fn<SubscribeOwnerMessages>().mockResolvedValue(undefined);
  await using view = await renderAddBaby({ createBaby, navigate, subscribeOwnerMessages });

  expect(view.queryByRole("switch", { name: "Message notifications" })).toBeNull();
  expect(view.queryByRole("button", { name: "Show me how" })).toBeNull();
  expect(view.queryByRole("button", { name: "Get Notifications" })).toBeNull();
  expect(view.queryByText("Get Notifications on iOS")).toBeNull();

  fireEvent.change(view.getByLabelText("Baby name"), {
    target: { value: "Baby Fern" },
  });
  fireEvent.change(view.getByLabelText("Due date"), {
    target: { value: "2026-09-09" },
  });
  fireEvent.click(view.getByRole("button", { name: "Add Baby" }));

  await vi.waitFor(() => {
    expect(createBaby).toHaveBeenCalled();
  });
  expect(subscribeOwnerMessages).not.toHaveBeenCalled();
});
