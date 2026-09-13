import { fireEvent } from "@testing-library/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { LanguageSettings } from "./language-settings";
import { htmlInput } from "@/test/htmlElement";

async function renderLanguageSettings(
  harness: Awaited<ReturnType<typeof createConvexTestHarness>>,
) {
  const profileHandle = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  return renderWithConvexTest({
    harness,
    ui: <LanguageSettings profile={profileHandle} />,
    wrap: null,
  });
}

test("changing the profile language persists it and applies the locale", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });

  await using view = await renderLanguageSettings(harness);

  fireEvent.click(view.getByRole("combobox", { name: "Profile language" }));
  const swedish = view.getByRole("option", { name: /^svenska$/i });
  fireEvent.pointerDown(swedish, { pointerType: "mouse" });
  fireEvent.click(swedish);

  await vi.waitFor(async () => {
    const profile = await harness.client.query(api.profile.get, {});
    expect(profile?.locale).toBe("sv");
  });
});

test("changing the profile time zone persists it", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });

  await using view = await renderLanguageSettings(harness);

  const picker = view.getByRole("combobox", { name: "Profile time zone" });
  const trigger = picker.parentElement?.querySelector("button");
  if (!trigger) {
    throw new Error("time zone trigger missing");
  }
  fireEvent.focus(picker);
  expect(htmlInput(picker).selectionStart).toBe(0);
  expect(htmlInput(picker).selectionEnd).toBe("London (Europe)".length);
  fireEvent.click(trigger);
  expect(htmlInput(picker).value).toBe("London (Europe)");
  expect(view.queryByText("No time zones found")).toBeNull();
  fireEvent.input(picker, { target: { value: "Tokyo" } });
  const tokyo = view.getByRole("option", { name: "Tokyo (Asia)" });
  fireEvent.pointerDown(tokyo, { pointerType: "mouse" });
  fireEvent.click(tokyo);

  expect(htmlInput(picker).value).toBe("Tokyo (Asia)");
  await vi.waitFor(async () => {
    const profile = await harness.client.query(api.profile.get, {});
    expect(profile?.timeZone).toBe("Asia/Tokyo");
  });

  fireEvent.click(trigger);
  fireEvent.input(picker, { target: { value: "Tokyo" } });
  const tokyoAgain = view.getByRole("option", { name: "Tokyo (Asia)" });
  fireEvent.pointerDown(tokyoAgain, { pointerType: "mouse" });
  fireEvent.click(tokyoAgain);
  await vi.waitFor(async () => {
    const profile = await harness.client.query(api.profile.get, {});
    expect(profile?.timeZone).toBe("Asia/Tokyo");
  });
});

test.each([
  { expectedMessage: "Could not save time zone", failure: new Error("Could not save time zone") },
  { expectedMessage: "Something went wrong. Try again.", failure: "offline" },
])("a failed time zone save rolls back for $expectedMessage", async (testCase) => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });

  const mutationSpy = vi.spyOn(harness.client, "mutation").mockImplementationOnce(async () => {
    throw testCase.failure;
  });
  await using _spy = makeResource({}, () => {
    mutationSpy.mockRestore();
  });
  const toastError = vi.spyOn(toast, "error");
  await using _toast = makeResource({}, () => {
    toastError.mockRestore();
  });

  await using view = await renderLanguageSettings(harness);

  const picker = view.getByRole("combobox", { name: "Profile time zone" });
  const trigger = picker.parentElement?.querySelector("button");
  if (!trigger) {
    throw new Error("time zone trigger missing");
  }
  fireEvent.click(trigger);
  fireEvent.input(picker, { target: { value: "Tokyo" } });
  const tokyo = view.getByRole("option", { name: "Tokyo (Asia)" });
  fireEvent.pointerDown(tokyo, { pointerType: "mouse" });
  fireEvent.click(tokyo);

  await vi.waitFor(() => {
    expect(htmlInput(picker).value).toBe("London (Europe)");
  });
  expect(toastError).toHaveBeenLastCalledWith(testCase.expectedMessage);
});

test("disables the picker and falls back to the UI locale without a profile", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderLanguageSettings(harness);

  const picker = view.getByRole("combobox", { name: "Profile language" });
  expect(picker.getAttribute("aria-disabled") ?? picker.getAttribute("disabled")).not.toBeNull();
});

test("LanguageSettings wires Convex mutations into the view", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });

  await using view = await renderLanguageSettings(harness);

  expect(view.getByText("Language")).toBeTruthy();
  expect(view.getByText("Time zone")).toBeTruthy();
  expect(view.getByRole("combobox", { name: "Profile language" })).toBeTruthy();
  expect(view.getByRole("combobox", { name: "Profile time zone" })).toBeTruthy();
});
