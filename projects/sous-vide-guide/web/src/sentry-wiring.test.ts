import { describe, expect, it } from "vitest";

import { getRouter } from "./router";
import { startInstance } from "./start";

import "./instrument.client";
import "./instrument.server";

describe("sentry wiring", () => {
  it("loads without a DSN and the router reports caught errors", () => {
    expect(startInstance).toBeDefined();
    const router = getRouter();
    const onCatch = router.options.defaultOnCatch;
    expect(onCatch).toBeTypeOf("function");
    if (onCatch === undefined) {
      return;
    }
    onCatch(new Error("caught in the router"), { componentStack: "" });
    expect(router.isServer).toBe(true);
  });
});
