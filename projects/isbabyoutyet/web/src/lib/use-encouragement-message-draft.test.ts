import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { useEncouragementMessageDraft } from "@/lib/use-encouragement-message-draft";

// SAFETY: Seeded convex-test document id.
const babyId = "baby_test_2" as Id<"baby">;

function sessionStorageResource() {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  return makeResource(store, () => {
    vi.unstubAllGlobals();
  });
}

test("debounces draft writes to sessionStorage", async () => {
  await using _storage = sessionStorageResource();
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });

  const hook = renderHook(
    (props) =>
      useEncouragementMessageDraft({
        authorName: props.authorName,
        babyId,
        message: props.message,
      }),
    { initialProps: { authorName: "", message: "" } },
  );
  await using _hook = makeResource({}, () => hook.unmount());

  act(() => hook.rerender({ authorName: "Grandma", message: "Draft" }));
  expect(sessionStorage.getItem(`encouragement-message-draft:${babyId}`)).toBeNull();

  act(() => vi.advanceTimersByTime(500));
  const stored = sessionStorage.getItem(`encouragement-message-draft:${babyId}`);
  expect(stored).toBeTruthy();
  if (!stored) {
    throw new Error("expected draft in sessionStorage");
  }
  const parsed = JSON.parse(stored);
  expect(parsed.authorName).toBe("Grandma");
  expect(parsed.message).toBe("Draft");
});
