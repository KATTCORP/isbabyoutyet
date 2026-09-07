import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { ForgotPasswordCard, Route as ForgotPasswordRoute } from "@/routes/auth/forgot-password";
import { ResetPasswordCard, Route as ResetPasswordRoute } from "@/routes/auth/reset-password";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { htmlInput } from "@/test/htmlElement";

test("forgot password card shows the sent confirmation from the URL", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ForgotPasswordCard onRequestReset={vi.fn()} sent />
    </LocaleProvider>,
    { path: "/auth/forgot-password" },
  );

  expect(
    screen.getByText(
      "If an account exists for that address, a password reset email is on its way.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to sign in" })).toBeTruthy();
});

test("forgot password card submits the email through the injected handler", async () => {
  const onRequestReset = vi.fn(async () => {});
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ForgotPasswordCard onRequestReset={onRequestReset} sent={false} />
    </LocaleProvider>,
    { path: "/auth/forgot-password" },
  );

  fireEvent.change(htmlInput(screen.getByLabelText("Email")), {
    target: { value: "parent@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

  await vi.waitFor(() => {
    expect(onRequestReset).toHaveBeenCalledWith({ email: "parent@example.com" });
  });
});

test("reset password card offers another link when the token is invalid", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ResetPasswordCard invalidLink onResetPassword={null} />
    </LocaleProvider>,
    { path: "/auth/reset-password" },
  );

  expect(screen.getByText("This reset link is invalid or has expired.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Request another link" })).toBeTruthy();
});

test("reset password card submits matching passwords", async () => {
  const onResetPassword = vi.fn(async () => {});
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ResetPasswordCard invalidLink={false} onResetPassword={onResetPassword} />
    </LocaleProvider>,
    { path: "/auth/reset-password" },
  );

  fireEvent.change(htmlInput(screen.getByLabelText("New password")), {
    target: { value: "new-password" },
  });
  fireEvent.change(htmlInput(screen.getByLabelText("Confirm new password")), {
    target: { value: "new-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));

  await vi.waitFor(() => {
    expect(onResetPassword).toHaveBeenCalledWith({
      confirmPassword: "new-password",
      password: "new-password",
    });
  });
});

test("forgot password card validates the email before submitting", async () => {
  const onRequestReset = vi.fn(async () => {});
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ForgotPasswordCard onRequestReset={onRequestReset} sent={false} />
    </LocaleProvider>,
    { path: "/auth/forgot-password" },
  );

  const email = htmlInput(screen.getByLabelText("Email"));
  fireEvent.change(email, {
    target: { value: "not-an-email" },
  });
  const form = email.form;
  if (!form) {
    throw new Error("expected forgot-password form");
  }
  // Native `type="email"` blocks the click path; submit the form so Zod runs.
  fireEvent.submit(form);

  await vi.waitFor(() => {
    expect(screen.getByText("Invalid email address")).toBeTruthy();
  });
  expect(onRequestReset).not.toHaveBeenCalled();
});

test("reset password card validates length and matching passwords", async () => {
  const onResetPassword = vi.fn(async () => {});
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ResetPasswordCard invalidLink={false} onResetPassword={onResetPassword} />
    </LocaleProvider>,
    { path: "/auth/reset-password" },
  );

  fireEvent.change(htmlInput(screen.getByLabelText("New password")), {
    target: { value: "short" },
  });
  fireEvent.change(htmlInput(screen.getByLabelText("Confirm new password")), {
    target: { value: "short" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));

  await vi.waitFor(() => {
    expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
  });
  expect(onResetPassword).not.toHaveBeenCalled();

  fireEvent.change(htmlInput(screen.getByLabelText("New password")), {
    target: { value: "new-password" },
  });
  fireEvent.change(htmlInput(screen.getByLabelText("Confirm new password")), {
    target: { value: "other-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));

  await vi.waitFor(() => {
    expect(screen.getByText("Passwords do not match")).toBeTruthy();
  });
  expect(onResetPassword).not.toHaveBeenCalled();
});

test("forgot-password route head sets the document title", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<{ title: string | undefined }>;
  } = ForgotPasswordRoute.options.head;
  const result = head({ match: { context: { locale: "en-GB" } } });
  expect(result.meta.some((entry) => entry.title?.includes("Reset your password"))).toBe(true);
});

test("reset-password route head sets the document title", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<{ title: string | undefined }>;
  } = ResetPasswordRoute.options.head;
  const result = head({ match: { context: { locale: "en-GB" } } });
  expect(result.meta.some((entry) => entry.title?.includes("Choose a new password"))).toBe(true);
});

test("ForgotPasswordPage wires the real auth client into ForgotPasswordCard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: "/auth/forgot-password",
    overlayHistory: null,
    path: "/auth/forgot-password",
    route: ForgotPasswordRoute,
    wrap: null,
  });

  expect(ctx.view.getByLabelText("Email")).toBeTruthy();
  expect(ctx.view.getByRole("button", { name: "Send reset link" })).toBeTruthy();
});

test("ForgotPasswordPage shows the sent confirmation from the URL", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: "/auth/forgot-password?sent=1",
    overlayHistory: null,
    path: "/auth/forgot-password",
    route: ForgotPasswordRoute,
    wrap: null,
  });

  expect(
    ctx.view.getByText(
      "If an account exists for that address, a password reset email is on its way.",
    ),
  ).toBeTruthy();
});

test("ResetPasswordPage offers another link when the token is missing", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: "/auth/reset-password",
    overlayHistory: null,
    path: "/auth/reset-password",
    route: ResetPasswordRoute,
    wrap: null,
  });

  expect(ctx.view.getByText("This reset link is invalid or has expired.")).toBeTruthy();
  expect(ctx.view.getByRole("link", { name: "Request another link" })).toBeTruthy();
});

test("ResetPasswordPage treats INVALID_TOKEN as an expired link", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await renderMountedFileRoute({
    harness,
    initialEntry: "/auth/reset-password?error=INVALID_TOKEN",
    overlayHistory: null,
    path: "/auth/reset-password",
    route: ResetPasswordRoute,
    wrap: null,
  });

  expect(ctx.view.getByText("This reset link is invalid or has expired.")).toBeTruthy();
});
