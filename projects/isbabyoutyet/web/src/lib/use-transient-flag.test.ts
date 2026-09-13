import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { useTransientFlag } from "./use-transient-flag";

function fakeTimersResource() {
  vi.useFakeTimers({ now: new Date("2026-08-18T00:00:00.000Z") });
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

test("expires a transient flag at its deadline", async () => {
  await using _timers = fakeTimersResource();
  const hook = renderHook(() => useTransientFlag(2000));
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current[0]).toBe(false);
  act(() => hook.result.current[1]());
  expect(hook.result.current[0]).toBe(true);

  act(() => vi.advanceTimersByTime(1999));
  expect(hook.result.current[0]).toBe(true);

  act(() => vi.advanceTimersByTime(1));
  expect(hook.result.current[0]).toBe(false);
});

test("retriggering extends the transient flag deadline", async () => {
  await using _timers = fakeTimersResource();
  const hook = renderHook(() => useTransientFlag(2000));
  await using _hook = makeResource({}, () => hook.unmount());

  act(() => hook.result.current[1]());
  act(() => vi.advanceTimersByTime(1500));
  act(() => hook.result.current[1]());
  act(() => vi.advanceTimersByTime(1999));
  expect(hook.result.current[0]).toBe(true);

  act(() => vi.advanceTimersByTime(1));
  expect(hook.result.current[0]).toBe(false);
});
