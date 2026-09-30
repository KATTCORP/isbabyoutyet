import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { usePasskeyAutofill } from "./use-passkey-autofill";

test("autofill starts a ceremony when the browser offers conditional UI", async () => {
  const onPasskey = vi.fn<(signal: AbortSignal) => Promise<void>>(async () => {});
  vi.stubGlobal("PublicKeyCredential", {
    isConditionalMediationAvailable: async () => true,
  });
  await using _globals = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  const hook = renderHook(() => usePasskeyAutofill({ onPasskey }));
  await using _hook = makeResource({}, () => {
    hook.unmount();
  });

  await vi.waitFor(() => {
    expect(onPasskey).toHaveBeenCalledTimes(1);
  });
  const signal = onPasskey.mock.calls[0]?.[0];
  expect(signal).toBeInstanceOf(AbortSignal);
});

test("autofill stays quiet when conditional UI is unavailable", async () => {
  const onPasskey = vi.fn(async () => {});
  const isConditionalMediationAvailable = vi.fn(async () => false);
  vi.stubGlobal("PublicKeyCredential", { isConditionalMediationAvailable });
  await using _globals = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  const hook = renderHook(() => usePasskeyAutofill({ onPasskey }));
  await using _hook = makeResource({}, () => {
    hook.unmount();
  });

  await vi.waitFor(() => {
    expect(isConditionalMediationAvailable).toHaveBeenCalled();
  });
  expect(onPasskey).not.toHaveBeenCalled();
});

test("a dismissed autofill ceremony does not surface an error", async () => {
  const onPasskey = vi.fn(async () => {
    throw new Error("Auth cancelled");
  });
  vi.stubGlobal("PublicKeyCredential", {
    isConditionalMediationAvailable: async () => true,
  });
  await using _globals = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  const hook = renderHook(() => usePasskeyAutofill({ onPasskey }));
  await using _hook = makeResource({}, () => {
    hook.unmount();
  });

  await vi.waitFor(() => {
    expect(onPasskey).toHaveBeenCalledTimes(1);
  });
});
