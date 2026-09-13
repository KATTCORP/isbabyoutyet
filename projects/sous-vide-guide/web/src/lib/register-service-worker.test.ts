// @vitest-environment jsdom
import { expect, test, vi } from "vitest";

type ServiceWorkerRegistrationLike = { scope: string };

function usingCleanup(dispose: () => void): Disposable {
  return {
    [Symbol.dispose]() {
      dispose();
    },
  };
}

function serviceWorkerResource(register: () => Promise<ServiceWorkerRegistrationLike>) {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
  return usingCleanup(() => {
    if (descriptor) {
      Object.defineProperty(navigator, "serviceWorker", descriptor);
    } else {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
}

function reportErrorResource(reportError: typeof globalThis.reportError) {
  const previous = globalThis.reportError;
  vi.stubGlobal("reportError", reportError);
  return usingCleanup(() => {
    vi.stubGlobal("reportError", previous);
  });
}

test("registers the service worker during client bootstrap", async () => {
  const registration = { scope: "/" };
  const register = vi
    .fn<() => Promise<ServiceWorkerRegistrationLike>>()
    .mockResolvedValue(registration);
  await using _serviceWorker = serviceWorkerResource(register);
  vi.resetModules();

  await import("./register-service-worker");
  await vi.waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
});

test("reports service worker registration failures", async () => {
  const cause = new Error("registration failed");
  const register = vi.fn<() => Promise<ServiceWorkerRegistrationLike>>().mockRejectedValue(cause);
  await using _serviceWorker = serviceWorkerResource(register);
  const reportError = vi.fn();
  await using _reportError = reportErrorResource(reportError);
  vi.resetModules();

  await import("./register-service-worker");
  await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(cause));
});
