import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { DEMO_EMPTY_USER, DEMO_USER } from "@baby-outlet/backend/src/seedCredentials";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  hasDemoLogin: true,
  navigate: vi.fn<(opts: { to: string }) => Promise<void>>(async () => {}),
  signInEmail: vi.fn<
    (opts: { email: string; password: string; rememberMe: boolean }) => Promise<{
      error: { message: string } | null;
    }>
  >(async () => ({ error: null })),
}));

vi.mock("@/lib/has-demo-login", () => ({
  get hasDemoLogin() {
    return mocks.hasDemoLogin;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: () => ReactElement }) => opts,
  Link: (props: React.ComponentProps<"a"> & { to: string | undefined }) => (
    <a href={typeof props.to === "string" ? props.to : "#"}>{props.children}</a>
  ),
  useRouter: () => ({ navigate: mocks.navigate }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: (opts: { email: string; password: string; rememberMe: boolean }) =>
        mocks.signInEmail(opts),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>() },
}));

const { Route } = await import("./login");
const LoginPage = (Route as unknown as { component: () => ReactElement }).component;

function renderLogin() {
  const view = render(
    <LocaleProvider locale="en-GB">
      <LoginPage />
    </LocaleProvider>,
  );
  return makeResource(view, () => {
    view.unmount();
  });
}

test("prefills and signs in when a test account is chosen", async () => {
  mocks.hasDemoLogin = true;
  mocks.navigate.mockClear();
  mocks.signInEmail.mockClear();
  mocks.signInEmail.mockResolvedValueOnce({ error: null });

  await using _view = renderLogin();

  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(DEMO_USER.email);

  fireEvent.change(screen.getByLabelText("Test account"), {
    target: { value: DEMO_EMPTY_USER.email },
  });

  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(DEMO_EMPTY_USER.email);
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
    DEMO_EMPTY_USER.password,
  );

  await vi.waitFor(() => {
    expect(mocks.signInEmail).toHaveBeenCalledWith({
      email: DEMO_EMPTY_USER.email,
      password: DEMO_EMPTY_USER.password,
      rememberMe: true,
    });
  });
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard" });
});

test("hides the test-account picker when demo login is disabled", async () => {
  mocks.hasDemoLogin = false;

  await using _view = renderLogin();

  expect(screen.queryByLabelText("Test account")).toBeNull();
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
});
