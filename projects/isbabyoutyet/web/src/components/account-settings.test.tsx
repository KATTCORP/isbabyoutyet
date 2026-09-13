import { fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { LocaleProvider } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { htmlInput } from "@/test/htmlElement";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import {
  AccountSettings,
  AccountSettingsView,
  accountAuthAdapter,
  accountSessionSnapshot,
  completeAccountAuthAction,
  type AccountSettingsHandlers,
  type AccountUser,
} from "./account-settings";

const sessionUser = {
  email: "ada@example.com",
  name: "Ada",
} satisfies AccountUser;

function renderAccount(opts: {
  onChangeEmail: AccountSettingsHandlers["onChangeEmail"] | null;
  onChangePassword: AccountSettingsHandlers["onChangePassword"] | null;
  onUpdateName: AccountSettingsHandlers["onUpdateName"] | null;
  user: AccountUser | null;
}) {
  return renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <AccountSettingsView
        onChangeEmail={opts.onChangeEmail}
        onChangePassword={opts.onChangePassword}
        onUpdateName={opts.onUpdateName}
        user={opts.user}
      />
    </LocaleProvider>,
  );
}

function readyHandlers() {
  return {
    onChangeEmail: vi.fn(async () => {}),
    onChangePassword: vi.fn(async () => {}),
    onUpdateName: vi.fn(async () => {}),
  };
}

test("completeAccountAuthAction throws the server message and skips success", async () => {
  const onSuccess = vi.fn(async () => {});
  await expect(
    completeAccountAuthAction(
      { errorMessage: "Nope" },
      { failedMessage: "Unable to update your name", onSuccess },
    ),
  ).rejects.toThrow("Nope");
  expect(onSuccess).not.toHaveBeenCalled();
});

test("completeAccountAuthAction uses the fallback when the server message is empty", async () => {
  const onSuccess = vi.fn(async () => {});
  await expect(
    completeAccountAuthAction(
      { errorMessage: "" },
      { failedMessage: "Unable to update your name", onSuccess },
    ),
  ).rejects.toThrow("Unable to update your name");
});

test("completeAccountAuthAction continues after a successful auth call", async () => {
  const onSuccess = vi.fn(async () => {});
  await completeAccountAuthAction({ errorMessage: null }, { failedMessage: "failed", onSuccess });
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test("accountSessionSnapshot maps a user or logged-out null", () => {
  expect(accountSessionSnapshot(null)).toEqual({ data: null });
  expect(accountSessionSnapshot(sessionUser)).toEqual({
    data: { user: sessionUser },
  });
});

test("changing email persists the new address", async () => {
  const persist = vi.fn(async () => null);
  const result = await accountAuthAdapter.changeEmail({
    newEmail: "new@example.com",
    persist,
  });

  expect(persist).toHaveBeenCalledWith({ newEmail: "new@example.com" });
  expect(result).toEqual({ error: null });
});

test("changing email returns the persist error", async () => {
  const result = await accountAuthAdapter.changeEmail({
    newEmail: "new@example.com",
    persist: async () => {
      throw new Error("Email already in use");
    },
  });

  expect(result).toEqual({ error: { message: "Email already in use" } });
});

test("account section previews name, email, and password with edit actions", async () => {
  await using view = await renderAccount({
    ...readyHandlers(),
    user: sessionUser,
  });

  expect(view.getByText("Your name")).toBeTruthy();
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getByText("ada@example.com")).toBeTruthy();
  expect(view.queryByText("Your email is verified.")).toBeNull();
  expect(view.getByRole("button", { name: "Edit name" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit email" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Edit password" })).toBeTruthy();
  expect(view.queryByRole("button", { name: "Send verification email" })).toBeNull();
});

test("name editor mounts fresh on open and submits the trimmed name", async () => {
  const onUpdateName = vi.fn(async () => {});
  await using view = await renderAccount({
    ...readyHandlers(),
    onUpdateName,
    user: sessionUser,
  });

  fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  const input = htmlInput(view.getByLabelText("Your name"));
  expect(input.value).toBe("Ada");
  fireEvent.change(input, { target: { value: "Ada Lovelace" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onUpdateName).toHaveBeenCalledWith({ name: "Ada Lovelace" });
  });
  await vi.waitFor(() => {
    expect(view.queryByLabelText("Your name")).toBeNull();
  });
});

test("name editor requires at least two characters", async () => {
  const onUpdateName = vi.fn(async () => {});
  await using view = await renderAccount({
    ...readyHandlers(),
    onUpdateName,
    user: sessionUser,
  });

  fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  fireEvent.change(htmlInput(view.getByLabelText("Your name")), { target: { value: "A" } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(view.getByText("Name must be at least 2 characters")).toBeTruthy();
  });
  expect(onUpdateName).not.toHaveBeenCalled();
});

test("change-email editor rejects the current address", async () => {
  const onChangeEmail = vi.fn(async () => {});
  await using view = await renderAccount({
    ...readyHandlers(),
    onChangeEmail,
    user: sessionUser,
  });

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  const emailInput = htmlInput(view.getByLabelText("New email"));
  expect(emailInput.value).toBe("ada@example.com");
  fireEvent.change(emailInput, {
    target: { value: "Ada@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(view.getByText("Choose a different email address.")).toBeTruthy();
  });
  expect(onChangeEmail).not.toHaveBeenCalled();
});

test("change-email editor submits a new address", async () => {
  const onChangeEmail = vi.fn(async () => {});
  await using view = await renderAccount({
    ...readyHandlers(),
    onChangeEmail,
    user: sessionUser,
  });

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  fireEvent.change(htmlInput(view.getByLabelText("New email")), {
    target: { value: "new@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onChangeEmail).toHaveBeenCalledWith({ newEmail: "new@example.com" });
  });
});

test("password editor requires a matching confirmation", async () => {
  const onChangePassword = vi.fn(async () => {});
  await using view = await renderAccount({
    ...readyHandlers(),
    onChangePassword,
    user: sessionUser,
  });

  fireEvent.click(view.getByRole("button", { name: "Edit password" }));
  fireEvent.change(htmlInput(view.getByLabelText("Current password")), {
    target: { value: "old-password" },
  });
  fireEvent.change(htmlInput(view.getByLabelText("New password")), {
    target: { value: "new-password" },
  });
  fireEvent.change(htmlInput(view.getByLabelText("Confirm new password")), {
    target: { value: "mismatch" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(view.getByText("Passwords do not match")).toBeTruthy();
  });
  expect(onChangePassword).not.toHaveBeenCalled();
});

test("password editor submits matching passwords", async () => {
  const onChangePassword = vi.fn(async () => {});
  await using view = await renderAccount({
    ...readyHandlers(),
    onChangePassword,
    user: sessionUser,
  });

  fireEvent.click(view.getByRole("button", { name: "Edit password" }));
  fireEvent.change(htmlInput(view.getByLabelText("Current password")), {
    target: { value: "old-password" },
  });
  fireEvent.change(htmlInput(view.getByLabelText("New password")), {
    target: { value: "new-password" },
  });
  fireEvent.change(htmlInput(view.getByLabelText("Confirm new password")), {
    target: { value: "new-password" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onChangePassword).toHaveBeenCalledWith({
      confirmPassword: "new-password",
      currentPassword: "old-password",
      newPassword: "new-password",
    });
  });
});

test("account rows hide editors when handlers are null", async () => {
  await using view = await renderAccount({
    onChangeEmail: null,
    onChangePassword: null,
    onUpdateName: null,
    user: sessionUser,
  });

  expect(view.queryByRole("button", { name: "Edit name" })).toBeNull();
  expect(view.queryByRole("button", { name: "Edit email" })).toBeNull();
  expect(view.queryByRole("button", { name: "Edit password" })).toBeNull();
  expect(view.getByText("Ada")).toBeTruthy();
});

test("account section shows a loading spinner while the session is missing", async () => {
  await using view = await renderAccount({
    onChangeEmail: null,
    onChangePassword: null,
    onUpdateName: null,
    user: null,
  });

  expect(view.getByText("Loading")).toBeTruthy();
  expect(view.queryByRole("button", { name: "Edit name" })).toBeNull();
});

function stubAccountAuth(overrides: {
  changeEmail:
    | ((body: {
        newEmail: string;
        persist: (args: { newEmail: string }) => Promise<null>;
      }) => Promise<{ error: { message: string | undefined } | null }>)
    | null;
  changePassword:
    | ((body: {
        currentPassword: string;
        newPassword: string;
        revokeOtherSessions: true;
      }) => Promise<{ error: { message: string | undefined } | null }>)
    | null;
  updateUser:
    | ((body: { name: string }) => Promise<{ error: { message: string | undefined } | null }>)
    | null;
}) {
  const originalChangeEmail = accountAuthAdapter.changeEmail;
  const originalChangePassword = accountAuthAdapter.changePassword;
  const originalUpdateUser = accountAuthAdapter.updateUser;
  if (overrides.changeEmail !== null) {
    // SAFETY: Test stub replaces the adapter's network-backed Better Auth method.
    accountAuthAdapter.changeEmail = overrides.changeEmail as typeof accountAuthAdapter.changeEmail;
  }
  if (overrides.changePassword !== null) {
    // SAFETY: Test stub replaces the adapter's network-backed Better Auth method.
    accountAuthAdapter.changePassword =
      overrides.changePassword as typeof accountAuthAdapter.changePassword;
  }
  if (overrides.updateUser !== null) {
    // SAFETY: Test stub replaces the adapter's network-backed Better Auth method.
    accountAuthAdapter.updateUser = overrides.updateUser as typeof accountAuthAdapter.updateUser;
  }
  return makeResource({}, () => {
    accountAuthAdapter.changeEmail = originalChangeEmail;
    accountAuthAdapter.changePassword = originalChangePassword;
    accountAuthAdapter.updateUser = originalUpdateUser;
  });
}

function successAuth() {
  return Promise.resolve({ error: null });
}

function stubToastSuccess() {
  const toastSuccess = vi.spyOn(toast, "success").mockReturnValue("toast-id");
  return makeResource({ toastSuccess }, () => {
    toastSuccess.mockRestore();
  });
}

function stubToastError() {
  const toastError = vi.spyOn(toast, "error").mockReturnValue("toast-id");
  return makeResource({ toastError }, () => {
    toastError.mockRestore();
  });
}

async function renderSignedInAccountSettings(
  harness: Awaited<ReturnType<typeof createConvexTestHarness>>,
) {
  const userId = await signUpTestUser(harness, {
    email: "ada@example.com",
    name: "Ada",
    password: "password123",
  });
  harness.withIdentity({ subject: userId });
  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  return renderWithConvexTest({
    harness,
    ui: <AccountSettings profile={profile} />,
    wrap: null,
  });
}

test("AccountSettings name path toasts success", async () => {
  await using toasts = stubToastSuccess();
  const updateUser = vi.fn(successAuth);
  await using _adapter = stubAccountAuth({
    changeEmail: null,
    changePassword: null,
    updateUser,
  });
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  fireEvent.change(htmlInput(view.getByLabelText("Your name")), {
    target: { value: "Ada Lovelace" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(updateUser).toHaveBeenCalledWith({ name: "Ada Lovelace" });
  });
  await vi.waitFor(() => {
    expect(toasts.toastSuccess).toHaveBeenCalledWith("Your name has been updated.");
  });
});

test("AccountSettings password path toasts success", async () => {
  await using toasts = stubToastSuccess();
  const changePassword = vi.fn(successAuth);
  await using _adapter = stubAccountAuth({
    changeEmail: null,
    changePassword,
    updateUser: null,
  });
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit password" }));
  fireEvent.change(htmlInput(view.getByLabelText("Current password")), {
    target: { value: "old-password" },
  });
  fireEvent.change(htmlInput(view.getByLabelText("New password")), {
    target: { value: "new-password" },
  });
  fireEvent.change(htmlInput(view.getByLabelText("Confirm new password")), {
    target: { value: "new-password" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password",
      revokeOtherSessions: true,
    });
  });
  await vi.waitFor(() => {
    expect(toasts.toastSuccess).toHaveBeenCalledWith("Your password has been updated.");
  });
});

test("AccountSettings change-email path toasts success", async () => {
  await using toasts = stubToastSuccess();
  const changeEmail = vi.fn(successAuth);
  await using _adapter = stubAccountAuth({
    changeEmail,
    changePassword: null,
    updateUser: null,
  });
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  fireEvent.change(htmlInput(view.getByLabelText("New email")), {
    target: { value: "new@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(changeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ newEmail: "new@example.com" }),
    );
  });
  await vi.waitFor(() => {
    expect(toasts.toastSuccess).toHaveBeenCalledWith("Your email has been updated.");
  });
});

test("AccountSettings name path throws the fallback when Better Auth omits a message", async () => {
  await using toasts = stubToastError();
  const updateUser = vi.fn(async () => ({ error: { message: undefined } }));
  await using _adapter = stubAccountAuth({
    changeEmail: null,
    changePassword: null,
    updateUser,
  });
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit name" }));
  fireEvent.change(htmlInput(view.getByLabelText("Your name")), {
    target: { value: "Ada Lovelace" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(toasts.toastError).toHaveBeenCalledWith("Unable to update your name");
  });
});

test("AccountSettings change-email path surfaces the adapter message", async () => {
  await using toasts = stubToastError();
  const changeEmail = vi.fn(async () => ({ error: { message: "Email taken" } }));
  await using _adapter = stubAccountAuth({
    changeEmail,
    changePassword: null,
    updateUser: null,
  });
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderSignedInAccountSettings(harness);

  fireEvent.click(view.getByRole("button", { name: "Edit email" }));
  fireEvent.change(htmlInput(view.getByLabelText("New email")), {
    target: { value: "new@example.com" },
  });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(toasts.toastError).toHaveBeenCalledWith("Email taken");
  });
});

test("AccountSettings shows loading when the profile query is logged out", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const profile = await harness.convexPreloader.ensureQueryData(api.profile.get, {});
  await using view = await renderWithConvexTest({
    harness,
    ui: <AccountSettings profile={profile} />,
    wrap: null,
  });

  expect(view.getByText("Loading")).toBeTruthy();
});
