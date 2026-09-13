import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { HOMEPAGE_DEMO_BABIES, HOMEPAGE_DEMO_BABY } from "@baby-outlet/backend/src/seedCredentials";

const mocks = vi.hoisted(() => ({
  custom: vi.fn<(...args: unknown[]) => string | number>(),
  dismiss: vi.fn<(id: string | number | undefined) => void>(),
}));

vi.mock("sonner", () => ({
  toast: {
    custom: mocks.custom,
    dismiss: mocks.dismiss,
  },
}));

const { HomepageDemoToast } = await import("./homepage-demo-toast");

function renderToastResource(publicId: string) {
  const view = render(<HomepageDemoToast publicId={publicId} />);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("shows a persistent demo toast on the homepage demo baby", async () => {
  mocks.custom.mockClear();
  mocks.dismiss.mockClear();

  await using _view = renderToastResource(HOMEPAGE_DEMO_BABY.publicId);

  expect(mocks.custom).toHaveBeenCalledTimes(1);
  const [renderToast, options] = mocks.custom.mock.calls[0] ?? [];
  expect(options).toMatchObject({
    duration: Infinity,
    closeButton: true,
  });
  expect(typeof renderToast).toBe("function");
});

test("does not toast on a real baby page, and dismisses when leaving the demo", async () => {
  mocks.custom.mockClear();
  mocks.dismiss.mockClear();

  {
    await using _demo = renderToastResource(HOMEPAGE_DEMO_BABY.publicId);
    expect(mocks.custom).toHaveBeenCalledTimes(1);
  }

  const options = mocks.custom.mock.calls[0]?.[1];
  if (!options || typeof options !== "object" || !("id" in options)) {
    throw new Error("expected toast options with an id");
  }
  expect(mocks.dismiss).toHaveBeenCalledWith(options.id);

  mocks.custom.mockClear();
  await using _other = renderToastResource("baby-waiting");
  expect(mocks.custom).not.toHaveBeenCalled();
});

test("shows the demo toast on every locale homepage baby", async () => {
  mocks.custom.mockClear();
  await using _view = renderToastResource(HOMEPAGE_DEMO_BABIES.sv.publicId);
  expect(mocks.custom).toHaveBeenCalledTimes(1);
});
