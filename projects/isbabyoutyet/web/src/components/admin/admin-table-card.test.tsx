import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { AdminTableCard, formatWhen } from "@/components/admin/admin-table-card";
import { renderResource } from "@/test/renderResource";

test("formatWhen returns a locale-aware timestamp", () => {
  expect(formatWhen(Date.UTC(2026, 0, 15, 12, 30), "en-GB")).toMatch(/15/);
});

test("admin table card requests another page when its end scrolls into view", async () => {
  const onLoadMore = vi.fn<() => void>();
  const observers: Array<IntersectionObserverCallback> = [];

  class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.push(callback);
    }
    observe() {
      this.callback(
        /* SAFETY: mock entry only needs isIntersecting for this callback. */
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    scrollMargin = "";
    thresholds = [];
  }
  const OriginalObserver = globalThis.IntersectionObserver;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  await using _observer = makeResource({}, () => {
    vi.stubGlobal("IntersectionObserver", OriginalObserver);
  });

  await using _view = renderResource(
    <AdminTableCard canLoadMore={true} isLoadingMore={false} onLoadMore={onLoadMore}>
      <div>rows</div>
    </AdminTableCard>,
  );

  expect(onLoadMore).toHaveBeenCalled();
  expect(observers.length).toBeGreaterThan(0);
});
