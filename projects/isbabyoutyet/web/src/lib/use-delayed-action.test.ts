import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { useDelayedAction, useDelayedBoolean, useTimedTransition } from "./use-delayed-action";

test("runs an enabled action after the delay and cancels when disabled", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  const action = vi.fn<() => void>();
  const hook = renderHook(
    (props) =>
      useDelayedAction({
        action,
        delayMs: 4000,
        enabled: props.enabled,
      }),
    { initialProps: { enabled: true } },
  );
  await using _hook = makeResource({}, () => hook.unmount());

  act(() => vi.advanceTimersByTime(3999));
  expect(action).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(action).toHaveBeenCalledOnce();

  action.mockClear();
  hook.rerender({ enabled: false });
  hook.rerender({ enabled: true });
  hook.rerender({ enabled: false });
  act(() => vi.advanceTimersByTime(4000));
  expect(action).not.toHaveBeenCalled();
});

test("delays becoming true and hides on the next timeout", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  const hook = renderHook((props) => useDelayedBoolean({ delayMs: 200, value: props.value }), {
    initialProps: { value: true },
  });
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current).toBe(false);
  act(() => vi.advanceTimersByTime(199));
  expect(hook.result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(hook.result.current).toBe(true);

  hook.rerender({ value: false });
  expect(hook.result.current).toBe(true);
  act(() => vi.advanceTimersByTime(0));
  expect(hook.result.current).toBe(false);
});

type TransitionProps = {
  value: "pending" | "sent";
};

test("reports only a live transition for the configured duration", async () => {
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => vi.useRealTimers());
  const initialProps: TransitionProps = { value: "sent" };
  const hook = renderHook(
    (props) =>
      useTimedTransition({
        durationMs: 4000,
        from: "pending",
        to: "sent",
        value: props.value,
      }),
    { initialProps },
  );
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current).toBe(false);
  hook.rerender({ value: "pending" });
  expect(hook.result.current).toBe(false);
  hook.rerender({ value: "sent" });
  expect(hook.result.current).toBe(true);

  act(() => vi.advanceTimersByTime(3999));
  expect(hook.result.current).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(hook.result.current).toBe(false);
});
