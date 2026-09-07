import type { RenderResult } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { api } from "@workspace/convex/convex/_generated/api";
import { DEMO_EMPTY_USER, DEMO_USER } from "@workspace/convex/src/seedCredentials";
import { Route } from "@/routes/auth/login";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import { signUpTestUser } from "@/test/convexTestSeed";
import { htmlInput } from "@/test/htmlElement";
import { renderMountedFileRoute } from "@/test/renderMountedFileRoute";

const ADA = { email: "ada@example.com", name: "Ada", password: "correct-horse" };

async function mountLogin(harness: ConvexTestHarness, url: string) {
  return await renderMountedFileRoute({
    harness,
    initialEntry: url,
    overlayHistory: null,
    path: "/auth/login",
    route: Route,
    wrap: null,
  });
}

function signInAs(view: RenderResult, credentials: { email: string; password: string }) {
  fireEvent.change(view.getByLabelText("Email"), { target: { value: credentials.email } });
  fireEvent.change(view.getByLabelText("Password"), { target: { value: credentials.password } });
  fireEvent.click(view.getByRole("button", { name: /sign in/i }));
}

test("signing in with a seeded account lands on the dashboard as that user", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await using ctx = await mountLogin(harness, "/auth/login");

  signInAs(ctx.view, ADA);

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(expect.objectContaining({ href: "/dashboard" }));
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: ADA.email, name: ADA.name }),
  );
});

test("a wrong password shows Better Auth's error and stays signed out", async () => {
  const toastError = vi.spyOn(toast, "error").mockImplementation(() => "");
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await using ctx = await mountLogin(harness, "/auth/login");

  signInAs(ctx.view, { email: ADA.email, password: "nope-nope" });

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("Invalid email or password");
  });
  expect(ctx.navigate).not.toHaveBeenCalled();
  expect(await harness.client.query(api.profile.get, {})).toBeNull();
});

test("picking a test account prefills the form and signs in as that account", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, DEMO_EMPTY_USER);
  await using ctx = await mountLogin(harness, "/auth/login");

  expect(htmlInput(ctx.view.getByLabelText("Email")).value).toBe(DEMO_USER.email);

  fireEvent.change(ctx.view.getByLabelText("Test account"), {
    target: { value: DEMO_EMPTY_USER.email },
  });

  expect(htmlInput(ctx.view.getByLabelText("Email")).value).toBe(DEMO_EMPTY_USER.email);
  expect(htmlInput(ctx.view.getByLabelText("Password")).value).toBe(DEMO_EMPTY_USER.password);
  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(expect.objectContaining({ href: "/dashboard" }));
  });
  expect(await harness.client.query(api.profile.get, {})).toEqual(
    expect.objectContaining({ email: DEMO_EMPTY_USER.email }),
  );
});

test("links out to sign-up and forgot-password", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using ctx = await mountLogin(harness, "/auth/login");

  expect(ctx.view.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/auth/signup");
  expect(ctx.view.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe(
    "/auth/forgot-password",
  );
});

test("an allowlisted redirect drives both the home link and the post-login destination", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await using ctx = await mountLogin(harness, "/auth/login?redirect=/baby/baby-waiting");

  expect(ctx.view.getByRole("link", { name: "isbabyoutyet" }).getAttribute("href")).toBe(
    "/baby/baby-waiting",
  );

  signInAs(ctx.view, ADA);

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/baby/baby-waiting" }),
    );
  });
});

test("an open redirect is ignored for both the home link and the post-login destination", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await signUpTestUser(harness, ADA);
  await using ctx = await mountLogin(harness, "/auth/login?redirect=https://evil.example");

  expect(ctx.view.getByRole("link", { name: "isbabyoutyet" }).getAttribute("href")).toBe("/");

  signInAs(ctx.view, ADA);

  await vi.waitFor(() => {
    expect(ctx.navigate).toHaveBeenCalledWith(expect.objectContaining({ href: "/dashboard" }));
  });
});

test("login route head sets the document title", () => {
  // @ts-expect-error — stub match is the locale head reads
  const head: (opts: { match: { context: { locale: "en-GB" } } }) => {
    meta: Array<{ title: string | undefined }>;
  } = Route.options.head;
  const result = head({ match: { context: { locale: "en-GB" } } });
  expect(result.meta.some((entry) => entry.title?.includes("Log in"))).toBe(true);
});
