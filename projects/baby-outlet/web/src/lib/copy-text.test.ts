import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import { expect, test, vi } from "vitest";
import { copyTextToClipboard } from "./copy-text";

test("copyTextToClipboard uses navigator.clipboard.writeText", async () => {
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  await using _clipboard = makeResource({}, () => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  await copyTextToClipboard("https://example.com/baby/test");

  expect(writeText).toHaveBeenCalledWith("https://example.com/baby/test");
});

test("copyTextToClipboard falls back to execCommand when writeText fails", async () => {
  const writeText = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("denied"));
  const execCommand = vi.fn<() => boolean>().mockReturnValue(true);
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  await using _clipboard = makeResource({}, () => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const hadExecCommand = "execCommand" in document;
  const originalExecCommand = document.execCommand;
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
    writable: true,
  });
  await using _exec = makeResource({}, () => {
    if (hadExecCommand) {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
        writable: true,
      });
      return;
    }
    Reflect.deleteProperty(document, "execCommand");
  });

  await copyTextToClipboard("https://example.com/baby/test");

  expect(writeText).toHaveBeenCalled();
  expect(execCommand).toHaveBeenCalledWith("copy");
});

test("copyTextToClipboard throws when both strategies fail", async () => {
  const writeText = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("denied"));
  const execCommand = vi.fn<() => boolean>().mockImplementation(() => {
    throw new Error("exec failed");
  });
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  await using _clipboard = makeResource({}, () => {
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const hadExecCommand = "execCommand" in document;
  const originalExecCommand = document.execCommand;
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
    writable: true,
  });
  await using _exec = makeResource({}, () => {
    if (hadExecCommand) {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
        writable: true,
      });
      return;
    }
    Reflect.deleteProperty(document, "execCommand");
  });

  await expect(copyTextToClipboard("https://example.com/baby/test")).rejects.toThrow("exec failed");
});
