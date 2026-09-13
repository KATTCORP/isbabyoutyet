import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEMO_EMPTY_USER, DEMO_USER } from "@baby-outlet/backend/src/seedCredentials";
import { LocaleProvider } from "@/lib/i18n";
import { LoginCard, LoginPage, Route } from "@/routes/auth/login";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { htmlInput } from "@/test/htmlElement";

function renderLogin(props: {
  demoLoginEnabled: boolean;
  onSignIn: (values: { email: string; password: string }) => Promise<void>;
}) {
  return renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <LoginCard
        demoLoginEnabled={props.demoLoginEnabled}
        onSignIn={props.onSignIn}
        signUpLink={{ to: "/auth/signup" }}
      />
    </LocaleProvider>,
    { path: "/auth/login" },
  );
}

test("picking a test account prefills the form and submits it", async () => {
  const onSignIn = vi
    .fn<(values: { email: string; password: string }) => Promise<void>>()
    .mockResolvedValue(undefined);
  await using _view = await renderLogin({ demoLoginEnabled: true, onSignIn });

  expect(htmlInput(screen.getByLabelText("Email")).value).toBe(DEMO_USER.email);

  fireEvent.change(screen.getByLabelText("Test account"), {
    target: { value: DEMO_EMPTY_USER.email },
  });

  expect(htmlInput(screen.getByLabelText("Email")).value).toBe(DEMO_EMPTY_USER.email);
  expect(htmlInput(screen.getByLabelText("Password")).value).toBe(DEMO_EMPTY_USER.password);

  await vi.waitFor(() => {
    expect(onSignIn).toHaveBeenCalledWith({
      email: DEMO_EMPTY_USER.email,
      password: DEMO_EMPTY_USER.password,
    });
  });
});

test("hides the test-account picker when demo login is disabled", async () => {
  const onSignIn = vi
    .fn<(values: { email: string; password: string }) => Promise<void>>()
    .mockResolvedValue(undefined);
  await using _view = await renderLogin({ demoLoginEnabled: false, onSignIn });

  expect(screen.queryByLabelText("Test account")).toBeNull();
  expect(htmlInput(screen.getByLabelText("Email")).value).toBe("");
  expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/auth/signup");
  expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe(
    "/auth/forgot-password",
  );
});

test("LoginPage wires the login form", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <LoginPage />
    </LocaleProvider>,
    { path: "/auth/login" },
  );

  expect(screen.getByLabelText("Email")).toBeTruthy();
  expect(screen.getByLabelText("Password")).toBeTruthy();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
});

test("login route head sets the document title", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<{ title: string | undefined }>;
  } = Route.options.head;
  const result = head({ match: { context: { locale: "en-GB" } } });
  expect(result.meta.some((entry) => entry.title?.includes("Log in"))).toBe(true);
});

test("LoginPage home link returns to an allowlisted baby page", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <LoginPage />
    </LocaleProvider>,
    { path: "/auth/login?redirect=/baby/baby-waiting" },
  );

  expect(screen.getByRole("link", { name: "isbabyoutyet" }).getAttribute("href")).toBe(
    "/baby/baby-waiting",
  );
});

test("LoginPage home link ignores an open-redirect", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <LoginPage />
    </LocaleProvider>,
    { path: "/auth/login?redirect=https://evil.example" },
  );

  expect(screen.getByRole("link", { name: "isbabyoutyet" }).getAttribute("href")).toBe("/");
});
