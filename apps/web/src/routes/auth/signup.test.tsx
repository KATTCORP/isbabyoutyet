import type { RenderResult } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
import { Route } from "@/routes/auth/signup";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { htmlInput } from "@/test/htmlElement";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";

const NEW_ACCOUNT = {
  email: "parent@example.com",
  name: "Test Parent",
  password: "password",
};

async function mountSignup(harness: ConvexTestHarness) {
  return await renderMountedFileRoute({
    harness,
    initialEntry: "/auth/signup",
    overlayHistory: null,
    path: "/auth/signup",
    route: Route,
    wrap: null,
  });
}

function signUpAs(view: RenderResult, account: { email: string; name: string; password: string }) {
  fireEvent.change(view.getByLabelText("Name"), { target: { value: account.name } });
  fireEvent.change(view.getByLabelText("Email"), { target: { value: account.email } });
  fireEvent.change(view.getByLabelText("Password"), { target: { value: account.password } });
  fireEvent.click(view.getByRole("button", { name: "Sign Up" }));
}

test("signup has no test-account picker and starts empty", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountSignup(harness);

  expect(ctx.view.queryByLabelText("Test account")).toBeNull();
  expect(htmlInput(ctx.view.getByLabelText("Name")).value).toBe("");
  expect(htmlInput(ctx.view.getByLabelText("Email")).value).toBe("");
  expect(htmlInput(ctx.view.getByLabelText("Password")).value).toBe("");
  expect(ctx.view.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/login");
});

test("creating an account signs the new user in and lands on the dashboard", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountSignup(harness);

  signUpAs(ctx.view, NEW_ACCOUNT);

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/dashboard" }));
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: NEW_ACCOUNT.email, name: NEW_ACCOUNT.name }),
  );
});

test("an email that is already registered shows Better Auth's error and stays signed out", async () => {
  const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, NEW_ACCOUNT);
  await using ctx = await mountSignup(harness);

  signUpAs(ctx.view, { ...NEW_ACCOUNT, name: "Someone Else" });

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/already exists/i));
  });
  expect(ctx.navigate).not.toHaveBeenCalled();
  expect(await harness.client.query(api.profile.get, {})).toBeNull();
});

test("signup route head sets the document title", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<{ title: string | undefined }>;
  } = Route.options.head;
  const result = head({ match: { context: { locale: "en-GB" } } });
  expect(result.meta.some((entry) => entry.title?.includes("Sign up"))).toBe(true);
});
