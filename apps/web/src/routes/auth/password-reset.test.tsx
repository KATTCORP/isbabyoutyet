import { fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { makeResource } from "@workspace/convex/convex/test.resource";
import { isString } from "@workspace/runtime/guards";
import { Route as ForgotPasswordRoute } from "@/routes/auth/forgot-password";
import { Route as ResetPasswordRoute } from "@/routes/auth/reset-password";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { canSignIn, signUpTestUser } from "@/test/convexTestSeed";
import { htmlInput } from "@/test/htmlElement";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";
import { untilCalled } from "@/test/untilCalled";

const ADA = { email: "ada@example.com", name: "Ada", password: "old-password" };

/** Email delivery logs locally unless the process looks like Vercel. */
function withoutVercelEnv() {
  const previous = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  return makeResource({}, () => {
    if (previous === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = previous;
    }
  });
}

/** Local delivery logs each callback URL on its own line. */
function capturePasswordResetLink() {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  return makeResource(
    {
      url: () => {
        const link = log.mock.calls
          .map((call) => call[0])
          .find((entry) => isString(entry) && entry.includes("/reset-password/"));
        if (!isString(link)) {
          throw new Error("no password-reset email was logged");
        }
        return link;
      },
    },
    () => {
      log.mockRestore();
    },
  );
}

async function mountForgotPassword(harness: ConvexTestHarness, url: string) {
  return await renderMountedFileRoute({
    harness,
    initialEntry: url,
    overlayHistory: null,
    path: "/auth/forgot-password",
    route: ForgotPasswordRoute,
    wrap: null,
  });
}

async function mountResetPassword(harness: ConvexTestHarness, url: string) {
  return await renderMountedFileRoute({
    harness,
    initialEntry: url,
    overlayHistory: null,
    path: "/auth/reset-password",
    route: ResetPasswordRoute,
    wrap: null,
  });
}

test("requesting a reset emails a link that lets the user choose a new password", async () => {
  await using _env = withoutVercelEnv();
  await using resetEmail = capturePasswordResetLink();
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);

  {
    await using ctx = await mountForgotPassword(harness, "/auth/forgot-password");
    fireEvent.change(ctx.view.getByLabelText("Email"), { target: { value: ADA.email } });
    fireEvent.click(ctx.view.getByRole("button", { name: "Send reset link" }));
    await untilCalled(ctx.navigate);
    expect(ctx.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { sent: "1" }, to: "/auth/forgot-password" }),
    );
  }

  // The emailed link is a Better Auth endpoint that redirects into the app.
  const emailed = await fetch(resetEmail.url(), { redirect: "manual" });
  expect(emailed.status).toBe(302);
  const target = new URL(emailed.headers.get("location") ?? "", "http://localhost");
  expect(target.pathname).toBe("/auth/reset-password");
  expect(target.searchParams.get("token")).toBeTruthy();

  {
    await using ctx = await mountResetPassword(harness, `${target.pathname}${target.search}`);
    fireEvent.change(ctx.view.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(ctx.view.getByLabelText("Confirm new password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(ctx.view.getByRole("button", { name: "Update password" }));
    await untilCalled(ctx.navigate);
    expect(ctx.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/auth/login" }));
  }

  expect(await canSignIn(harness, { email: ADA.email, password: "new-password" })).toBe(true);
  expect(await canSignIn(harness, { email: ADA.email, password: ADA.password })).toBe(false);
});

test("a stale reset token is rejected without leaving the page", async () => {
  const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await using ctx = await mountResetPassword(harness, "/auth/reset-password?token=stale");

  fireEvent.change(ctx.view.getByLabelText("New password"), {
    target: { value: "new-password" },
  });
  fireEvent.change(ctx.view.getByLabelText("Confirm new password"), {
    target: { value: "new-password" },
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Update password" }));

  await untilCalled(toastError);
  expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/invalid|expired/i));
  expect(ctx.navigate).not.toHaveBeenCalled();
  expect(await canSignIn(harness, { email: ADA.email, password: ADA.password })).toBe(true);
});

test("forgot password shows the sent confirmation from the URL", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountForgotPassword(harness, "/auth/forgot-password?sent=1");

  expect(
    ctx.view.getByText(
      "If an account exists for that address, a password reset email is on its way.",
    ),
  ).toBeTruthy();
  expect(ctx.view.getByRole("link", { name: "Back to sign in" })).toBeTruthy();
});

test("forgot password validates the email before submitting", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountForgotPassword(harness, "/auth/forgot-password");

  const email = htmlInput(ctx.view.getByLabelText("Email"));
  fireEvent.change(email, { target: { value: "not-an-email" } });
  const form = email.form;
  if (!form) {
    throw new Error("expected forgot-password form");
  }
  // Native `type="email"` blocks the click path; submit the form so Zod runs.
  fireEvent.submit(form);

  await vi.waitFor(() => {
    expect(ctx.view.getByText("Invalid email address")).toBeTruthy();
  });
  expect(ctx.navigate).not.toHaveBeenCalled();
});

test("reset password offers another link when the token is missing", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountResetPassword(harness, "/auth/reset-password");

  expect(ctx.view.getByText("This reset link is invalid or has expired.")).toBeTruthy();
  expect(ctx.view.getByRole("link", { name: "Request another link" })).toBeTruthy();
  expect(ctx.view.queryByLabelText("New password")).toBeNull();
});

test("reset password treats INVALID_TOKEN as an expired link", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountResetPassword(harness, "/auth/reset-password?error=INVALID_TOKEN");

  expect(ctx.view.getByText("This reset link is invalid or has expired.")).toBeTruthy();
});

test("reset password validates length and matching passwords", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountResetPassword(harness, "/auth/reset-password?token=abc");

  fireEvent.change(ctx.view.getByLabelText("New password"), { target: { value: "short" } });
  fireEvent.change(ctx.view.getByLabelText("Confirm new password"), {
    target: { value: "short" },
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Update password" }));

  await vi.waitFor(() => {
    expect(ctx.view.getByText("Password must be at least 8 characters")).toBeTruthy();
  });

  fireEvent.change(ctx.view.getByLabelText("New password"), {
    target: { value: "new-password" },
  });
  fireEvent.change(ctx.view.getByLabelText("Confirm new password"), {
    target: { value: "other-password" },
  });
  fireEvent.click(ctx.view.getByRole("button", { name: "Update password" }));

  await vi.waitFor(() => {
    expect(ctx.view.getByText("Passwords do not match")).toBeTruthy();
  });
  expect(ctx.navigate).not.toHaveBeenCalled();
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
