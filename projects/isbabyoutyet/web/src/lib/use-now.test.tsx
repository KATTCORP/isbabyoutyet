import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { renderResource } from "@/test/renderResource";
import { RenderedAtProvider, useNow } from "./use-now";

function useFakeTimersResource(now: Date) {
  vi.useFakeTimers({ now });
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

function Clock() {
  return <time>{new Date(useNow()).toISOString()}</time>;
}

const RENDERED_AT = Date.parse("2026-08-18T08:00:20.000Z");

function App() {
  return (
    <RenderedAtProvider renderedAt={RENDERED_AT}>
      <Clock />
    </RenderedAtProvider>
  );
}

test("hydrates at the moment the server rendered, then moves to the browser's clock", async () => {
  // Three hours after the render: the HTML came from a cache.
  await using _timers = useFakeTimersResource(new Date("2026-08-18T11:00:40.000Z"));
  const container = document.createElement("div");
  container.innerHTML = renderToString(<App />);
  document.body.append(container);
  await using _container = makeResource({}, () => {
    container.remove();
  });
  expect(container.textContent).toBe("2026-08-18T08:00:20.000Z");

  const mismatches: Array<unknown> = [];
  const root = await act(() =>
    hydrateRoot(container, <App />, {
      onRecoverableError: (error) => {
        mismatches.push(error);
      },
    }),
  );
  await using _root = makeResource({}, () => {
    act(() => {
      root.unmount();
    });
  });

  expect(mismatches).toEqual([]);
  expect(container.textContent).toBe("2026-08-18T11:00:00.000Z");
});

test("moves once a minute, and stops its timer with its last reader", async () => {
  await using _timers = useFakeTimersResource(new Date("2026-08-18T08:00:20.000Z"));
  const view = renderResource(<Clock />);
  {
    await using _view = view;
    expect(view.container.textContent).toBe("2026-08-18T08:00:00.000Z");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(view.container.textContent).toBe("2026-08-18T08:01:00.000Z");
    expect(vi.getTimerCount()).toBe(1);
  }
  expect(vi.getTimerCount()).toBe(0);
});
