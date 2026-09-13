import { renderHook } from "@testing-library/react";
import { expect, expectTypeOf, test } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { useLastMatch } from "./use-last-match";

const FORBIDDEN = "forbidden" as const;

type Profile = { name: string; photoUrl: string | null };
type Snapshot = Profile | typeof FORBIDDEN | null;
type HookProps = { value: Snapshot };

function renderAuthorized(initialProps: HookProps) {
  return renderHook((props) => useLastMatch(props.value, (v) => !!v && v !== FORBIDDEN), {
    initialProps,
  });
}

function renderPhoto(initialProps: HookProps) {
  return renderHook((props) => useLastMatch(props.value, (v) => v !== FORBIDDEN && !!v?.photoUrl), {
    initialProps,
  });
}

test("returns the matching value and updates when a new match arrives", async () => {
  const hook = renderAuthorized({ value: { name: "Avery", photoUrl: null } });
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current).toEqual({ name: "Avery", photoUrl: null });
  expectTypeOf(hook.result.current).toEqualTypeOf<Profile | null>();

  hook.rerender({ value: { name: "Juniper", photoUrl: null } });
  expect(hook.result.current).toEqual({ name: "Juniper", photoUrl: null });
});

test("keeps the last match when the live value stops matching", async () => {
  const hook = renderAuthorized({ value: { name: "Avery", photoUrl: null } });
  await using _hook = makeResource({}, () => hook.unmount());

  hook.rerender({ value: null });
  expect(hook.result.current).toEqual({ name: "Avery", photoUrl: null });

  hook.rerender({ value: FORBIDDEN });
  expect(hook.result.current).toEqual({ name: "Avery", photoUrl: null });
});

test("starts as null until something matches", async () => {
  const hook = renderAuthorized({ value: FORBIDDEN });
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current).toBeNull();

  hook.rerender({ value: { name: "Avery", photoUrl: null } });
  expect(hook.result.current).toEqual({ name: "Avery", photoUrl: null });
});

test("a property check keeps the same object without narrowing the property", async () => {
  const hook = renderPhoto({ value: { name: "Avery", photoUrl: null } });
  await using _hook = makeResource({}, () => hook.unmount());

  expect(hook.result.current).toBeNull();
  // TypeScript cannot carry `photoUrl: string` out of a boolean callback.
  expectTypeOf(hook.result.current).toEqualTypeOf<Snapshot>();

  const avery: Profile = { name: "Avery", photoUrl: "/avery.jpg" };
  hook.rerender({ value: avery });
  expect(hook.result.current).toBe(avery);

  hook.rerender({ value: { name: "Avery", photoUrl: null } });
  expect(hook.result.current).toBe(avery);
  hook.rerender({ value: FORBIDDEN });
  expect(hook.result.current).toBe(avery);
  hook.rerender({ value: null });
  expect(hook.result.current).toBe(avery);
});
