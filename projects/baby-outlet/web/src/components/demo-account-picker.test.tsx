import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { DEMO_ACCOUNTS, DEMO_EMPTY_USER } from "@baby-outlet/backend/src/seedCredentials";

const mocks = vi.hoisted(() => ({
  hasDemoLogin: true,
}));

vi.mock("@/lib/has-demo-login", () => ({
  get hasDemoLogin() {
    return mocks.hasDemoLogin;
  },
}));

const { DemoAccountPicker } = await import("./demo-account-picker");

function renderPicker(onPrefill: (account: (typeof DEMO_ACCOUNTS)[number]) => void) {
  const view = render(<DemoAccountPicker onPrefill={onPrefill} />);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("lists seeded test accounts and reports the chosen one", async () => {
  mocks.hasDemoLogin = true;
  const onPrefill = vi.fn<(account: (typeof DEMO_ACCOUNTS)[number]) => void>();
  await using _view = renderPicker(onPrefill);

  for (const account of DEMO_ACCOUNTS) {
    expect(screen.getByRole("option", { name: account.label })).toBeTruthy();
  }

  fireEvent.change(screen.getByLabelText("Test account"), {
    target: { value: DEMO_EMPTY_USER.email },
  });

  expect(onPrefill).toHaveBeenCalledWith(
    expect.objectContaining({
      email: DEMO_EMPTY_USER.email,
      password: DEMO_EMPTY_USER.password,
      name: DEMO_EMPTY_USER.name,
    }),
  );
  expect(onPrefill).toHaveBeenCalledTimes(1);
});

test("hides entirely when demo login is disabled", async () => {
  mocks.hasDemoLogin = false;

  await using _view = renderPicker(() => {});

  expect(screen.queryByLabelText("Test account")).toBeNull();
});
