import { fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
import { AccountSettings } from "@/components/account-settings";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { canSignIn, signInTestUser, signUpTestUser } from "@/test/convexTestSeed";
import { htmlInput } from "@/test/htmlElement";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { untilCalled } from "@/test/untilCalled";

const ADA = { email: "ada@example.com", name: "Ada", password: "old-password" };

/** Sign Ada up and in (browser-style, so the session cookie exists), then mount the rows. */
async function renderSignedInAccountSettings(harness: ConvexTestHarness) {
  await signUpTestUser(harness, ADA);
  await signInTestUser(harness, ADA);
  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  return await renderWithConvexTest({
    harness,
    ui: <AccountSettings profile={profile} />,
    wrap: null,
  });
}

function fillPasswordEditor(
  view: Awaited<ReturnType<typeof renderWithConvexTest>>,
  values: { confirm: string; current: string; next: string },
) {
  fireEvent.click(view.getByRole("button", { name: "Edit password" }));
  fireEvent.change(view.getByLabelText("Current password"), { target: { value: values.current } });
  fireEvent.change(view.getByLabelText("New password"), { target: { value: values.next } });
  fireEvent.change(view.getByLabelText("Confirm new password"), {
    target: { value: values.confirm },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));
}

test("shows the signed-in user's name and email with edit actions", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  expect(view.getByText("Your name")).toBeTruthy();
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getByText("ada@example.com")).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit name" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit email" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit password" })).toBeTruthy();
});

test("shows a loading spinner when nobody is signed in", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  await using view = await renderWithConvexTest({
    harness,
    ui: <AccountSettings profile={profile} />,
    wrap: null,
  });

  expect(view.getByText("Loading")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Edit name" })).toBeNull();
});

test("saving a new name updates the account and the row", async () => {
  const toastSuccess = vi.spyOn(toast, "success").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  const input = htmlInput(view.getByLabelText("Your name"));
  expect(input.value).toBe("Ada");
  fireEvent.change(input, { target: { value: "Ada Lovelace" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await untilCalled(toastSuccess);
  expect(toastSuccess).toHaveBeenCalledWith("Your name has been updated.");
  await vi.waitFor(() => {
    expect(view.queryByLabelText("Your name")).toBeNull();
    expect(view.getByText("Ada Lovelace")).toBeTruthy();
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ name: "Ada Lovelace" }),
  );
});

test("the name editor requires at least two characters", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  fireEvent.change(htmlInput(view.getByLabelText("Your name")), { target: { value: "A" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(view.getByText("Name must be at least 2 characters")).toBeTruthy();
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ name: "Ada" }),
  );
});

test("saving a new email updates the account and the row", async () => {
  const toastSuccess = vi.spyOn(toast, "success").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  const input = htmlInput(view.getByLabelText("New email"));
  expect(input.value).toBe("ada@example.com");
  fireEvent.change(input, { target: { value: "ada.lovelace@example.com" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await untilCalled(toastSuccess);
  expect(toastSuccess).toHaveBeenCalledWith("Your email has been updated.");
  await vi.waitFor(() => {
    expect(view.queryByLabelText("New email")).toBeNull();
    expect(view.getByText("ada.lovelace@example.com")).toBeTruthy();
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: "ada.lovelace@example.com", emailVerified: false }),
  );
  expect(
    await canSignIn(harness, { email: "ada.lovelace@example.com", password: ADA.password }),
  ).toBe(true);
});

test("the email editor rejects the current address before saving", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  fireEvent.change(htmlInput(view.getByLabelText("New email")), {
    target: { value: "Ada@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(view.getByText("Choose a different email address.")).toBeTruthy();
  });
});

test("an email that belongs to another account is refused", async () => {
  const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, {
    email: "grace@example.com",
    name: "Grace",
    password: "hunter22",
  });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  fireEvent.change(htmlInput(view.getByLabelText("New email")), {
    target: { value: "grace@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await untilCalled(toastError);
  expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/email already in use/i));
  expect(view.getByLabelText("New email")).toBeTruthy();
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: "ada@example.com" }),
  );
});

test("changing the password makes the new one work and the old one stop", async () => {
  const toastSuccess = vi.spyOn(toast, "success").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fillPasswordEditor(view, {
    confirm: "brand-new-password",
    current: ADA.password,
    next: "brand-new-password",
  });

  await untilCalled(toastSuccess);
  expect(toastSuccess).toHaveBeenCalledWith("Your password has been updated.");
  await vi.waitFor(() => {
    expect(view.queryByLabelText("Current password")).toBeNull();
  });
  expect(await canSignIn(harness, { email: ADA.email, password: "brand-new-password" })).toBe(true);
  expect(await canSignIn(harness, { email: ADA.email, password: ADA.password })).toBe(false);
});

test("a wrong current password is refused and nothing changes", async () => {
  const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fillPasswordEditor(view, {
    confirm: "brand-new-password",
    current: "not-my-password",
    next: "brand-new-password",
  });

  await untilCalled(toastError);
  expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/invalid password/i));
  expect(view.getByLabelText("Current password")).toBeTruthy();
  expect(await canSignIn(harness, { email: ADA.email, password: ADA.password })).toBe(true);
  expect(await canSignIn(harness, { email: ADA.email, password: "brand-new-password" })).toBe(
    false,
  );
});

test("the password editor requires a matching confirmation", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fillPasswordEditor(view, {
    confirm: "mismatch",
    current: ADA.password,
    next: "brand-new-password",
  });

  await vi.waitFor(() => {
    expect(view.getByText("Passwords do not match")).toBeTruthy();
  });
  expect(await canSignIn(harness, { email: ADA.email, password: ADA.password })).toBe(true);
});
