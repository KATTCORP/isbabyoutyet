import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { testPreloadedConvexQuery } from "@workspace/convex-prefetch/test-helpers";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  updateLocale: vi.fn<(args: unknown) => Promise<unknown>>(),
  requestLanguage: vi.fn<(args: unknown) => Promise<unknown>>(),
  setLocale: vi.fn<(locale: string) => Promise<void>>(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) =>
      getFunctionName(ref) === "profile:requestLanguage"
        ? mocks.requestLanguage
        : mocks.updateLocale,
  };
});

vi.mock("@/lib/paraglide-setup", () => ({
  setLocale: mocks.setLocale,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn<(message: string) => void>(), error: vi.fn<(message: string) => void>() },
}));

const { LanguageSettings } = await import("./language-settings");

const profileHandle = testPreloadedConvexQuery<typeof api.profile.get>({
  input: {},
  initialData: { locale: "en-GB", isAdmin: false },
});

function renderResource(handle = profileHandle) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider locale="en-GB">
        <LanguageSettings profile={handle} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return makeResource(view, () => {
    view.unmount();
    queryClient.clear();
  });
}

test("changing the profile language persists it and applies the locale", async () => {
  mocks.updateLocale.mockResolvedValue(null);
  mocks.setLocale.mockResolvedValue(undefined);
  await using _view = renderResource();

  fireEvent.click(screen.getByRole("combobox", { name: "Profile language" }));
  const swedish = screen.getByRole("option", { name: /^svenska$/i });
  fireEvent.pointerDown(swedish, { pointerType: "mouse" });
  fireEvent.click(swedish);

  await waitFor(() => {
    expect(mocks.updateLocale).toHaveBeenCalledWith({ locale: "sv" });
  });
  await waitFor(() => {
    expect(mocks.setLocale).toHaveBeenCalledWith("sv");
  });
});

test("disables the picker and falls back to the UI locale without a profile", async () => {
  const anonymousHandle = testPreloadedConvexQuery<typeof api.profile.get>({
    input: {},
    initialData: null,
  });
  await using _view = renderResource(anonymousHandle);

  const picker = screen.getByRole("combobox", { name: "Profile language" });
  expect(picker.getAttribute("aria-disabled") ?? picker.getAttribute("disabled")).not.toBeNull();
});

test("requesting another language submits the request form", async () => {
  mocks.requestLanguage.mockResolvedValue(null);
  await using view = renderResource();

  fireEvent.click(view.getByRole("button", { name: "Request another language" }));
  const input = screen.getByLabelText("Language name or code");
  fireEvent.change(input, {
    target: { value: "French / fr-FR" },
  });
  const form = input.closest("form");
  if (!form) throw new Error("request form missing");
  fireEvent.submit(form);

  await waitFor(() => {
    expect(mocks.requestLanguage).toHaveBeenCalledWith({ requestedLocale: "French / fr-FR" });
  });
});
