import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { createDismissedIdsStore, useIsDismissed } from "./use-dismissed-ids";

test("dismissing an id re-renders subscribers as dismissed", async () => {
  const store = createDismissedIdsStore();
  const hook = renderHook((props) => useIsDismissed(store, props.id), {
    initialProps: { id: "juniper-hale" },
  });
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current).toBe(false);
  act(() => store.dismiss("juniper-hale"));
  expect(hook.result.current).toBe(true);
});

test("dismissing one id does not dismiss another", async () => {
  const store = createDismissedIdsStore();
  const hook = renderHook((props) => useIsDismissed(store, props.id), {
    initialProps: { id: "ella-holm" },
  });
  await using _hook = makeResource({}, () => hook.unmount());

  act(() => store.dismiss("juniper-hale"));
  expect(hook.result.current).toBe(false);

  hook.rerender({ id: "juniper-hale" });
  expect(hook.result.current).toBe(true);
});

test("a second subscriber on the same id updates after dismiss", async () => {
  const store = createDismissedIdsStore();
  const first = renderHook(() => useIsDismissed(store, "juniper-hale"));
  const second = renderHook(() => useIsDismissed(store, "juniper-hale"));
  await using _first = makeResource({}, () => first.unmount());
  await using _second = makeResource({}, () => second.unmount());

  expect(first.result.current).toBe(false);
  expect(second.result.current).toBe(false);

  act(() => store.dismiss("juniper-hale"));
  expect(first.result.current).toBe(true);
  expect(second.result.current).toBe(true);
});

test("dismissing an already-dismissed id does not notify again", async () => {
  const store = createDismissedIdsStore();
  const hook = renderHook(() => useIsDismissed(store, "juniper-hale"));
  await using _hook = makeResource({}, () => hook.unmount());

  act(() => store.dismiss("juniper-hale"));
  expect(hook.result.current).toBe(true);
  act(() => store.dismiss("juniper-hale"));
  expect(hook.result.current).toBe(true);
});

test("clearing restores subscribers and is a no-op when empty", async () => {
  const store = createDismissedIdsStore();
  const hook = renderHook(() => useIsDismissed(store, "juniper-hale"));
  await using _hook = makeResource({}, () => hook.unmount());

  act(() => store.clear());
  expect(hook.result.current).toBe(false);

  act(() => store.dismiss("juniper-hale"));
  expect(hook.result.current).toBe(true);
  act(() => store.clear());
  expect(hook.result.current).toBe(false);
});
