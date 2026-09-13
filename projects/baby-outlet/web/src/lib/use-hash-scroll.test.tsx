import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { installMatchMediaStub } from "@/test/stubJsdomWindow";
import { renderResource } from "@/test/renderResource";
import { NOTIFICATION_CLICK_MESSAGE } from "@/lib/notification-click";
import { useHashScroll } from "@/lib/use-hash-scroll";

function HashScrollHarness() {
  useHashScroll();
  return (
    <div>
      <div className="h-[2000px]">top</div>
      <section id="feed">Updates & messages</section>
    </div>
  );
}

function withHash(hash: string) {
  window.location.hash = hash;
  return makeResource({}, () => {
    window.location.hash = "";
  });
}

function withScrollSpy() {
  const scrollIntoView = vi.fn();
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  return makeResource(scrollIntoView, () => {
    HTMLElement.prototype.scrollIntoView = originalScroll;
  });
}

function withMatchMedia(matches: (query: string) => boolean) {
  return makeResource({}, installMatchMediaStub(matches));
}

test("smooth-scrolls to the hash landmark on load", async () => {
  await using _hash = withHash("#feed");
  await using scrollIntoView = withScrollSpy();

  await using _view = renderResource(<HashScrollHarness />);

  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "start",
  });
});

test("does not scroll when the location has no hash", async () => {
  await using _hash = withHash("");
  await using scrollIntoView = withScrollSpy();

  await using _view = renderResource(<HashScrollHarness />);

  expect(scrollIntoView).not.toHaveBeenCalled();
});

test("does not scroll when the hash landmark is missing", async () => {
  await using _hash = withHash("#missing");
  await using scrollIntoView = withScrollSpy();

  await using _view = renderResource(<HashScrollHarness />);

  expect(scrollIntoView).not.toHaveBeenCalled();
});

test("uses instant scroll when the user prefers reduced motion", async () => {
  await using _hash = withHash("#feed");
  await using scrollIntoView = withScrollSpy();
  await using _motion = withMatchMedia((query) => query.includes("prefers-reduced-motion"));

  await using _view = renderResource(<HashScrollHarness />);

  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "auto",
    block: "start",
  });
});

test("scrolls again when the service worker posts a notification-click", async () => {
  await using _hash = withHash("#feed");
  await using scrollIntoView = withScrollSpy();
  const listeners: Array<EventListener> = [];
  const addEventListener = vi.fn<(type: string, listener: EventListener) => void>(
    (type, listener) => {
      if (type === "message") {
        listeners.push(listener);
      }
    },
  );
  const removeEventListener = vi.fn();
  const originalServiceWorker = navigator.serviceWorker;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { addEventListener, removeEventListener },
  });
  await using _sw = makeResource({}, () => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalServiceWorker,
      });
      return;
    }
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  await using _view = renderResource(<HashScrollHarness />);
  scrollIntoView.mockClear();
  listeners[0]?.(new MessageEvent("message", { data: { type: NOTIFICATION_CLICK_MESSAGE } }));

  expect(scrollIntoView).toHaveBeenCalledOnce();
});

test("notification-click with a feed url sets the hash when the page has none", async () => {
  await using _hash = withHash("");
  await using scrollIntoView = withScrollSpy();
  const listeners: Array<EventListener> = [];
  const addEventListener = vi.fn<(type: string, listener: EventListener) => void>(
    (type, listener) => {
      if (type === "message") {
        listeners.push(listener);
      }
    },
  );
  const removeEventListener = vi.fn();
  const originalServiceWorker = navigator.serviceWorker;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { addEventListener, removeEventListener },
  });
  await using _sw = makeResource({}, () => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalServiceWorker,
      });
      return;
    }
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  await using _view = renderResource(<HashScrollHarness />);
  expect(listeners).toHaveLength(1);
  scrollIntoView.mockClear();
  listeners[0]?.(
    new MessageEvent("message", {
      data: {
        type: NOTIFICATION_CLICK_MESSAGE,
        url: "#feed",
      },
    }),
  );

  expect(window.location.hash).toBe("#feed");
  expect(scrollIntoView).toHaveBeenCalled();
});

test("ignores service-worker messages that are not notification clicks", async () => {
  await using _hash = withHash("#feed");
  await using scrollIntoView = withScrollSpy();
  const listeners: Array<EventListener> = [];
  const addEventListener = vi.fn<(type: string, listener: EventListener) => void>(
    (_type, listener) => {
      listeners.push(listener);
    },
  );
  const removeEventListener = vi.fn();
  const originalServiceWorker = navigator.serviceWorker;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { addEventListener, removeEventListener },
  });
  await using _sw = makeResource({}, () => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: originalServiceWorker,
      });
      return;
    }
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  await using _view = renderResource(<HashScrollHarness />);
  scrollIntoView.mockClear();
  listeners[0]?.(new MessageEvent("message", { data: "nope" }));
  listeners[0]?.(new MessageEvent("message", { data: { type: "other" } }));

  expect(scrollIntoView).not.toHaveBeenCalled();
});
