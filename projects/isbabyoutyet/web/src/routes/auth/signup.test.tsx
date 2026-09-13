import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { SignupCard, SignupPage, Route } from "@/routes/auth/signup";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { htmlInput } from "@/test/htmlElement";

type NewAccount = { email: string; name: string; password: string };

const NEW_ACCOUNT: NewAccount = {
  email: "parent@example.com",
  name: "Test Parent",
  password: "password",
};

function renderSignup(onSignUp: (values: NewAccount) => Promise<void>) {
  return renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <SignupCard onSignUp={onSignUp} signInLink={{ to: "/auth/login" }} />
    </LocaleProvider>,
    { path: "/auth/signup" },
  );
}

test("signup has no test-account picker and starts empty", async () => {
  const onSignUp = vi.fn<(values: NewAccount) => Promise<void>>().mockResolvedValue(undefined);
  await using _view = await renderSignup(onSignUp);

  expect(screen.queryByLabelText("Test account")).toBeNull();
  expect(htmlInput(screen.getByLabelText("Name")).value).toBe("");
  expect(htmlInput(screen.getByLabelText("Email")).value).toBe("");
  expect(htmlInput(screen.getByLabelText("Password")).value).toBe("");
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/login");
});

test("submitting the form hands the new account to the signup flow", async () => {
  const onSignUp = vi.fn<(values: NewAccount) => Promise<void>>().mockResolvedValue(undefined);
  await using _view = await renderSignup(onSignUp);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: NEW_ACCOUNT.name } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: NEW_ACCOUNT.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: NEW_ACCOUNT.password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

  await vi.waitFor(() => {
    expect(onSignUp).toHaveBeenCalledWith(NEW_ACCOUNT);
  });
});

test("SignupPage wires the signup form", async () => {
  await using _view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <SignupPage />
    </LocaleProvider>,
    { path: "/auth/signup" },
  );

  expect(screen.getByLabelText("Name")).toBeTruthy();
  expect(screen.getByLabelText("Email")).toBeTruthy();
  expect(screen.getByLabelText("Password")).toBeTruthy();
  expect(screen.getByRole("button", { name: /sign up|create/i })).toBeTruthy();
});

test("signup route head sets the document title", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<{ title: string | undefined }>;
  } = Route.options.head;
  const result = head({ match: { context: { locale: "en-GB" } } });
  expect(result.meta.some((entry) => entry.title?.includes("Sign up"))).toBe(true);
});
