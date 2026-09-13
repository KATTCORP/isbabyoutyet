import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { LocaleProvider } from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn<(opts: { to: string }) => Promise<void>>(async () => {}),
  signUpEmail: vi.fn<
    (opts: { email: string; password: string; name: string }) => Promise<{
      error: { message: string } | null;
    }>
  >(async () => ({ error: null })),
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
    signUp: {
      email: (opts: { email: string; password: string; name: string }) => mocks.signUpEmail(opts),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>() },
}));

const { Route } = await import("./signup");
const SignupPage = (Route as unknown as { component: () => ReactElement }).component;

function renderSignup() {
  const view = render(
    <LocaleProvider locale="en-GB">
      <SignupPage />
    </LocaleProvider>,
  );
  return makeResource(view, () => {
    view.unmount();
  });
}

test("signup has no test-account picker and starts empty", async () => {
  await using _view = renderSignup();

  expect(screen.queryByLabelText("Test account")).toBeNull();
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
});
