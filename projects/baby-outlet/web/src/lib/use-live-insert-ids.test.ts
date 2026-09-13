import { renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { useLiveInsertIds } from "./use-live-insert-ids";

type LiveInsertItem = {
  id: string;
  sortKey: number;
};

const emptyItems: Array<LiveInsertItem> = [];

test("the first snapshot is never a live insert, including an empty list", async () => {
  const empty = renderHook((props) => useLiveInsertIds(props.items), {
    initialProps: { items: emptyItems },
  });
  await using _empty = makeResource({}, () => empty.unmount());
  expect(empty.result.current.size).toBe(0);

  const seeded = renderHook((props) => useLiveInsertIds(props.items), {
    initialProps: {
      items: [
        { id: "new", sortKey: 20 },
        { id: "old", sortKey: 10 },
      ],
    },
  });
  await using _seeded = makeResource({}, () => seeded.unmount());
  expect(seeded.result.current.has("new")).toBe(false);
  expect(seeded.result.current.has("old")).toBe(false);
});

test("marks unseen newer ids as live inserts and keeps them marked", async () => {
  const hook = renderHook((props) => useLiveInsertIds(props.items), {
    initialProps: {
      items: [
        { id: "b", sortKey: 20 },
        { id: "a", sortKey: 10 },
      ],
    },
  });
  await using _hook = makeResource({}, () => hook.unmount());

  hook.rerender({
    items: [
      { id: "c", sortKey: 30 },
      { id: "b", sortKey: 20 },
      { id: "a", sortKey: 10 },
    ],
  });
  expect(hook.result.current.has("c")).toBe(true);
  expect(hook.result.current.has("b")).toBe(false);

  hook.rerender({
    items: [
      { id: "c", sortKey: 30 },
      { id: "b", sortKey: 20 },
      { id: "a", sortKey: 10 },
    ],
  });
  expect(hook.result.current.has("c")).toBe(true);
});

test("does not mark older appended ids as live inserts", async () => {
  const hook = renderHook((props) => useLiveInsertIds(props.items), {
    initialProps: {
      items: [{ id: "b", sortKey: 20 }],
    },
  });
  await using _hook = makeResource({}, () => hook.unmount());

  hook.rerender({
    items: [
      { id: "b", sortKey: 20 },
      { id: "a", sortKey: 10 },
    ],
  });
  expect(hook.result.current.has("a")).toBe(false);
  expect(hook.result.current.size).toBe(0);
});

test("a first item after an empty snapshot is a live insert", async () => {
  const hook = renderHook((props) => useLiveInsertIds(props.items), {
    initialProps: { items: emptyItems },
  });
  await using _hook = makeResource({}, () => hook.unmount());

  hook.rerender({ items: [{ id: "a", sortKey: 10 }] });
  expect(hook.result.current.has("a")).toBe(true);
});
