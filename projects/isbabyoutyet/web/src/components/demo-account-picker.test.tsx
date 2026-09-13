import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEMO_ACCOUNTS, DEMO_EMPTY_USER } from "@isbabyoutyet/backend/src/seedCredentials";
import { DemoAccountPicker } from "./demo-account-picker";
import { renderResource } from "@/test/renderResource";

function renderPicker(opts: {
  enabled: boolean;
  onPrefill: (account: (typeof DEMO_ACCOUNTS)[number]) => void;
}) {
  return renderResource(<DemoAccountPicker enabled={opts.enabled} onPrefill={opts.onPrefill} />);
}

test("lists seeded test accounts and reports the chosen one", async () => {
  const onPrefill = vi.fn<(account: (typeof DEMO_ACCOUNTS)[number]) => void>();
  await using _view = renderPicker({ enabled: true, onPrefill });

  for (const account of DEMO_ACCOUNTS) {
    expect(screen.getByRole("option", { name: account.label })).toBeTruthy();
  }

  fireEvent.change(screen.getByLabelText("Test account"), {
    target: { value: DEMO_EMPTY_USER.email },
  });

  expect(onPrefill).toHaveBeenCalledWith(
    expect.objectContaining({
      email: DEMO_EMPTY_USER.email,
      name: DEMO_EMPTY_USER.name,
      password: DEMO_EMPTY_USER.password,
    }),
  );
  expect(onPrefill).toHaveBeenCalledTimes(1);
});

test("hides entirely when demo login is disabled", async () => {
  await using _view = renderPicker({ enabled: false, onPrefill: () => {} });

  expect(screen.queryByLabelText("Test account")).toBeNull();
});
