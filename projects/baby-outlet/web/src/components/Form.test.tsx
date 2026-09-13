import { CheckIcon } from "@phosphor-icons/react";
import { fireEvent } from "@testing-library/react";
import { Dialog, DialogContent } from "@workspace/ui/components/dialog";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { renderResource } from "@/test/renderResource";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import {
  Form,
  FormCancelButton,
  FormGuardProvider,
  SubmitButton,
  useFormGuard,
  useZodForm,
} from "@/components/Form";
import { LocaleProvider } from "@/lib/i18n";
import { htmlButton, htmlInput } from "@/test/htmlElement";

function spyOnToastErrorResource() {
  const toastError = vi.spyOn(toast, "error").mockReturnValue("toast-id");
  return makeResource(toastError, () => {
    toastError.mockRestore();
  });
}

function ContextSubmitForm(props: {
  disabled: boolean | undefined;
  onSubmit: (values: { note: string }) => Promise<void>;
}) {
  const form = useZodForm({
    defaultValues: { note: "hi" },
    schema: z.object({ note: z.string() }),
  });
  return (
    <Form form={form} handleSubmit={props.onSubmit}>
      <FormCancelButton form="context">Cancel</FormCancelButton>
      <SubmitButton
        disabled={props.disabled}
        form="context"
        IconComponent={CheckIcon}
        iconPosition="start"
      >
        Send
      </SubmitButton>
    </Form>
  );
}

function ExplicitSubmitForm(props: { onSubmit: (values: { note: string }) => Promise<void> }) {
  const form = useZodForm({
    defaultValues: { note: "hi" },
    schema: z.object({ note: z.string() }),
  });
  return (
    <div>
      <Form form={form} handleSubmit={props.onSubmit}>
        <span>fields</span>
      </Form>
      <SubmitButton form={form} IconComponent={CheckIcon} iconPosition="end">
        Send
      </SubmitButton>
    </div>
  );
}

test("SubmitButton keeps its label and swaps the icon for a spinner while submitting", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseSubmit: (() => void) | undefined;
  const onSubmit = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });
  });

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ContextSubmitForm disabled={undefined} onSubmit={onSubmit} />
    </LocaleProvider>,
  );

  const button = htmlButton(view.getByRole("button", { name: "Send" }));
  expect(view.queryByRole("status")).toBeNull();
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-busy")).toBe("false");

  fireEvent.click(button);

  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(button.disabled).toBe(true);
  });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.querySelector('[data-slot="spinner"]')).toBeTruthy();
  expect(button.textContent).toContain("Send");
  expect(onSubmit).toHaveBeenCalledWith({ note: "hi" });

  releaseSubmit?.();
  await vi.advanceTimersByTimeAsync(0);

  await vi.waitFor(() => {
    expect(button.disabled).toBe(false);
  });
  expect(button.querySelector('[data-slot="spinner"]')).toBeNull();
  expect(button.getAttribute("aria-busy")).toBe("false");
});
test("SubmitButton can target an explicit form outside the <form> element", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  const onSubmit = vi.fn(async () => undefined);

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ExplicitSubmitForm onSubmit={onSubmit} />
    </LocaleProvider>,
  );

  const button = view.getByRole("button", { name: "Send" });
  const formId = button.getAttribute("form");
  expect(formId).toBeTruthy();
  expect(document.getElementById(formId ?? "")).toBeTruthy();

  fireEvent.click(button);
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith({ note: "hi" });
  });
});

test("SubmitButton honors an extra disabled prop while idle", async () => {
  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ContextSubmitForm disabled={true} onSubmit={vi.fn(async () => undefined)} />
    </LocaleProvider>,
  );

  expect(htmlButton(view.getByRole("button", { name: "Send" })).disabled).toBe(true);
});

test("SubmitButton throws when used outside a Form without an explicit form", () => {
  expect(() => {
    renderResource(
      <LocaleProvider locale="en-GB">
        <SubmitButton form="context" IconComponent={CheckIcon} iconPosition="start">
          Send
        </SubmitButton>
      </LocaleProvider>,
    );
  }).toThrow("SubmitButton must be used within a Form or have a form prop");
});

test("Form surfaces uncaught submit errors as a toast", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  await using toastError = spyOnToastErrorResource();

  const onSubmit = vi.fn(async () => {
    throw new Error("Nope");
  });

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ContextSubmitForm disabled={undefined} onSubmit={onSubmit} />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Send" }));
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("Nope");
  });
});

test("Form toasts a generic message for non-Error throws", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  await using toastError = spyOnToastErrorResource();

  const onSubmit = vi.fn(async () => {
    const nonError = { failed: true } satisfies { failed: true };
    throw nonError;
  });

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ContextSubmitForm disabled={undefined} onSubmit={onSubmit} />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "Send" }));
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(toastError).toHaveBeenCalledWith("Something went wrong. Try again.");
  });
});

test("SubmitButton supports an emoji glyph at the end of the label", async () => {
  function EmojiSubmitForm() {
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });
    return (
      <Form form={form} handleSubmit={async () => undefined}>
        <SubmitButton form="context" IconComponent="🍼" iconPosition="end">
          Add Baby
        </SubmitButton>
      </Form>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <EmojiSubmitForm />
    </LocaleProvider>,
  );

  const button = view.getByRole("button", { name: "Add Baby" });
  expect(button.textContent).toContain("🍼");
  expect(button.textContent?.endsWith("🍼")).toBe(true);
});

test("SubmitButton accepts IconComponent={null} for label-only actions", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseSubmit: (() => void) | undefined;
  const onSubmit = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });
  });

  function NullIconForm() {
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });
    return (
      <Form form={form} handleSubmit={onSubmit}>
        <SubmitButton form="context" IconComponent={null} iconPosition="start">
          Confirm
        </SubmitButton>
      </Form>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <NullIconForm />
    </LocaleProvider>,
  );

  const button = htmlButton(view.getByRole("button", { name: "Confirm" }));
  expect(button.querySelector("svg")).toBeNull();
  expect(button.querySelector('[data-slot="spinner"]')).toBeNull();

  fireEvent.click(button);
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(button.disabled).toBe(true);
  });
  expect(button.querySelector('[data-slot="spinner"]')).toBeTruthy();

  releaseSubmit?.();
  await vi.advanceTimersByTimeAsync(0);

  await vi.waitFor(() => {
    expect(button.disabled).toBe(false);
  });
  expect(button.querySelector('[data-slot="spinner"]')).toBeNull();
});

test("FormCancelButton honors an extra disabled prop while idle", async () => {
  function DisabledCancelForm() {
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });
    return (
      <Form form={form} handleSubmit={async () => undefined}>
        <FormCancelButton disabled={true} form="context" variant="secondary">
          Cancel
        </FormCancelButton>
      </Form>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <DisabledCancelForm />
    </LocaleProvider>,
  );

  expect(htmlButton(view.getByRole("button", { name: "Cancel" })).disabled).toBe(true);
});

test("FormCancelButton disables while its form is submitting", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseSubmit: (() => void) | undefined;
  const onSubmit = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });
  });

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <ContextSubmitForm disabled={undefined} onSubmit={onSubmit} />
    </LocaleProvider>,
  );

  const cancel = htmlButton(view.getByRole("button", { name: "Cancel" }));
  expect(cancel.disabled).toBe(false);

  fireEvent.click(view.getByRole("button", { name: "Send" }));
  await vi.advanceTimersByTimeAsync(500);

  await vi.waitFor(() => {
    expect(cancel.disabled).toBe(true);
  });

  releaseSubmit?.();
  await vi.advanceTimersByTimeAsync(0);

  await vi.waitFor(() => {
    expect(cancel.disabled).toBe(false);
  });
});

test("useFormGuard blocks escape while submitting and forwards when idle", async () => {
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();

  let releaseSubmit: (() => void) | undefined;
  const onSubmit = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });
  });
  const forwarded = vi.fn<(open: boolean) => void>();

  function OverlayLockForm() {
    const overlay = useFormGuard({ onOpenChange: forwarded, open: true });
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });

    return (
      <FormGuardProvider guard={overlay}>
        <button
          onClick={() => {
            const cancel = vi.fn();
            overlay.rootProps.onOpenChange(false, {
              cancel,
              reason: "escape-key",
            });
            htmlInput(document.getElementById("dismiss-result")).value = String(
              cancel.mock.calls.length,
            );
          }}
          type="button"
        >
          TryEscape
        </button>
        <button
          onClick={() => {
            const cancel = vi.fn();
            overlay.rootProps.onOpenChange(false, {
              cancel,
              reason: "imperative-action",
            });
            htmlInput(document.getElementById("imperative-result")).value = String(
              cancel.mock.calls.length,
            );
          }}
          type="button"
        >
          TryImperative
        </button>
        <button
          onClick={() => {
            overlay.close();
          }}
          type="button"
        >
          Close
        </button>
        <input defaultValue="unset" id="dismiss-result" readOnly />
        <input defaultValue="unset" id="imperative-result" readOnly />
        <Form form={form} handleSubmit={onSubmit}>
          <FormCancelButton form={form}>Cancel</FormCancelButton>
          <SubmitButton form="context" IconComponent={CheckIcon} iconPosition="start">
            Send
          </SubmitButton>
        </Form>
      </FormGuardProvider>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <OverlayLockForm />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "TryEscape" }));
  expect(htmlInput(document.getElementById("dismiss-result")).value).toBe("0");
  expect(forwarded).toHaveBeenCalledWith(false);
  forwarded.mockClear();

  fireEvent.click(view.getByRole("button", { name: "Send" }));
  await vi.advanceTimersByTimeAsync(500);
  await vi.waitFor(() => {
    expect(htmlButton(view.getByRole("button", { name: "Cancel" })).disabled).toBe(true);
  });

  fireEvent.click(view.getByRole("button", { name: "TryEscape" }));
  expect(htmlInput(document.getElementById("dismiss-result")).value).toBe("1");
  expect(forwarded).not.toHaveBeenCalled();

  fireEvent.click(view.getByRole("button", { name: "TryImperative" }));
  expect(htmlInput(document.getElementById("imperative-result")).value).toBe("0");
  expect(forwarded).toHaveBeenCalledWith(false);
  forwarded.mockClear();

  // The imperative close never asks, even mid-submit.
  fireEvent.click(view.getByRole("button", { name: "Close" }));
  expect(forwarded).toHaveBeenCalledWith(false);

  releaseSubmit?.();
  await vi.advanceTimersByTimeAsync(0);
  await vi.waitFor(() => {
    expect(htmlButton(view.getByRole("button", { name: "Cancel" })).disabled).toBe(false);
  });
});

test("useFormGuard close is a no-op on a full page without an overlay", async () => {
  function IdleOverlay() {
    const overlay = useFormGuard(null);
    return (
      <>
        <button onClick={() => overlay.close()} type="button">
          Close
        </button>
        <button
          onClick={() => {
            overlay.rootProps.onOpenChange(false, {
              cancel: () => undefined,
              reason: "escape-key",
            });
          }}
          type="button"
        >
          EscapeIdle
        </button>
      </>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <IdleOverlay />
    </LocaleProvider>,
  );

  expect(() => {
    fireEvent.click(view.getByRole("button", { name: "Close" }));
  }).not.toThrow();
  expect(() => {
    fireEvent.click(view.getByRole("button", { name: "EscapeIdle" }));
  }).not.toThrow();
});

test("dirty overlay dismiss prompts to discard and keep editing stays put", async () => {
  const forwarded = vi.fn<(open: boolean) => void>();

  function DirtyOverlayForm() {
    const overlay = useFormGuard({ onOpenChange: forwarded, open: true });
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });

    return (
      <FormGuardProvider guard={overlay}>
        <button
          onClick={() => {
            const cancel = vi.fn();
            overlay.rootProps.onOpenChange(false, {
              cancel,
              reason: "escape-key",
            });
            htmlInput(document.getElementById("dismiss-result")).value = String(
              cancel.mock.calls.length,
            );
          }}
          type="button"
        >
          TryEscape
        </button>
        <input defaultValue="unset" id="dismiss-result" readOnly />
        <Form form={form} handleSubmit={async () => undefined}>
          <input aria-label="Note" {...form.register("note")} />
        </Form>
      </FormGuardProvider>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <DirtyOverlayForm />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "TryEscape" }));
  expect(view.queryByRole("alertdialog")).toBeNull();
  expect(forwarded).toHaveBeenCalledWith(false);
  forwarded.mockClear();

  fireEvent.change(view.getByLabelText("Note"), { target: { value: "hello" } });
  fireEvent.click(view.getByRole("button", { name: "TryEscape" }));
  expect(htmlInput(document.getElementById("dismiss-result")).value).toBe("1");
  expect(forwarded).not.toHaveBeenCalled();
  expect(view.getByRole("alertdialog")).toBeTruthy();
  expect(view.getByText("If you close now, your edits will be lost.")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("alertdialog")).toBeNull();
  });
  expect(forwarded).not.toHaveBeenCalled();
  expect(htmlInput(view.getByLabelText("Note")).value).toBe("hello");

  fireEvent.click(view.getByRole("button", { name: "TryEscape" }));
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  expect(forwarded).toHaveBeenCalledWith(false);
});

test("dirty overlay still allows imperative close and date-picker dismiss", async () => {
  const forwarded = vi.fn<(open: boolean) => void>();

  function DirtyOverlayForm() {
    const overlay = useFormGuard({ onOpenChange: forwarded, open: true });
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });

    return (
      <FormGuardProvider guard={overlay}>
        <button
          onClick={() => {
            const cancel = vi.fn();
            overlay.rootProps.onOpenChange(false, {
              cancel,
              reason: "imperative-action",
            });
            htmlInput(document.getElementById("imperative-result")).value = String(
              cancel.mock.calls.length,
            );
          }}
          type="button"
        >
          TryImperative
        </button>
        <button
          onClick={() => {
            const cancel = vi.fn();
            overlay.rootProps.onOpenChange(false, {
              cancel,
              reason: "outside-press",
            });
            htmlInput(document.getElementById("picker-result")).value = String(
              cancel.mock.calls.length,
            );
          }}
          type="button"
        >
          TryPicker
        </button>
        <input defaultValue="unset" id="imperative-result" readOnly />
        <input defaultValue="unset" id="picker-result" readOnly />
        <Form form={form} handleSubmit={async () => undefined}>
          <input aria-label="Note" {...form.register("note")} />
        </Form>
      </FormGuardProvider>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <DirtyOverlayForm />
    </LocaleProvider>,
  );

  fireEvent.change(view.getByLabelText("Note"), { target: { value: "hello" } });

  fireEvent.click(view.getByRole("button", { name: "TryImperative" }));
  expect(htmlInput(document.getElementById("imperative-result")).value).toBe("0");
  expect(forwarded).toHaveBeenCalledWith(false);
  expect(view.queryByRole("alertdialog")).toBeNull();
  forwarded.mockClear();

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  document.body.append(dateInput);
  dateInput.focus();
  fireEvent.click(view.getByRole("button", { name: "TryPicker" }));
  expect(htmlInput(document.getElementById("picker-result")).value).toBe("1");
  expect(forwarded).not.toHaveBeenCalled();
  expect(view.queryByRole("alertdialog")).toBeNull();
  dateInput.remove();
});

test("parent overlay prompts when a nested dirty form is dismissed from the parent", async () => {
  const parentForwarded = vi.fn<(open: boolean) => void>();

  function NestedDirtyOverlays() {
    const parent = useFormGuard({ onOpenChange: parentForwarded, open: true });
    const child = useFormGuard({ defaultOpen: true });
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });
    return (
      <FormGuardProvider guard={parent}>
        <button
          onClick={() => {
            const cancel = vi.fn();
            parent.rootProps.onOpenChange(false, {
              cancel,
              reason: "outside-press",
            });
            htmlInput(document.getElementById("parent-dismiss")).value = String(
              cancel.mock.calls.length,
            );
          }}
          type="button"
        >
          DismissParent
        </button>
        <input defaultValue="unset" id="parent-dismiss" readOnly />
        <FormGuardProvider guard={child}>
          <Form form={form} handleSubmit={async () => undefined}>
            <input aria-label="Note" {...form.register("note")} />
          </Form>
        </FormGuardProvider>
      </FormGuardProvider>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <NestedDirtyOverlays />
    </LocaleProvider>,
  );

  fireEvent.click(view.getByRole("button", { name: "DismissParent" }));
  expect(parentForwarded).toHaveBeenCalledWith(false);
  parentForwarded.mockClear();

  fireEvent.change(view.getByLabelText("Note"), { target: { value: "hello" } });
  fireEvent.click(view.getByRole("button", { name: "DismissParent" }));
  expect(htmlInput(document.getElementById("parent-dismiss")).value).toBe("1");
  expect(parentForwarded).not.toHaveBeenCalled();
  expect(view.getByRole("alertdialog")).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("alertdialog")).toBeNull();
  });
  expect(parentForwarded).not.toHaveBeenCalled();
  expect(htmlInput(view.getByLabelText("Note")).value).toBe("hello");

  fireEvent.click(view.getByRole("button", { name: "DismissParent" }));
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  expect(parentForwarded).toHaveBeenCalledWith(false);
});

test("discard prompt blocks clicks on the dialog behind it", async () => {
  const onDialogOpenChange = vi.fn<(open: boolean) => void>();

  function DirtyDialogForm() {
    const overlay = useFormGuard({ onOpenChange: onDialogOpenChange, open: true });
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });

    return (
      <Dialog {...overlay.rootProps}>
        <DialogContent>
          <FormGuardProvider guard={overlay}>
            <Form form={form} handleSubmit={async () => undefined}>
              <input aria-label="Note" {...form.register("note")} />
            </Form>
          </FormGuardProvider>
        </DialogContent>
      </Dialog>
    );
  }

  await using view = await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <DirtyDialogForm />
    </LocaleProvider>,
  );

  fireEvent.change(view.getByLabelText("Note"), { target: { value: "hello" } });
  const dialogClose = view.getByRole("button", { name: "Close" });
  fireEvent.click(dialogClose);

  await vi.waitFor(() => {
    expect(view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(onDialogOpenChange).not.toHaveBeenCalled();

  fireEvent.click(dialogClose);
  expect(view.getByRole("alertdialog")).toBeTruthy();
  expect(onDialogOpenChange).not.toHaveBeenCalled();
  expect(htmlInput(view.getByLabelText("Note")).value).toBe("hello");
});

test("dirty form overlay blocks in-app navigation until discarded", async () => {
  function DirtyFormPage() {
    const router = useRouter();
    const overlay = useFormGuard(null);
    const form = useZodForm({
      defaultValues: { note: "hi" },
      schema: z.object({ note: z.string() }),
    });
    return (
      <LocaleProvider locale="en-GB">
        <FormGuardProvider guard={overlay}>
          <Form form={form} handleSubmit={async () => undefined}>
            <input aria-label="Note" {...form.register("note")} />
          </Form>
          <button
            onClick={() => {
              router.history.push("/other");
            }}
            type="button"
          >
            Leave
          </button>
        </FormGuardProvider>
      </LocaleProvider>
    );
  }

  const rootRoute = createRootRoute({
    component: function TestRoot() {
      return <Outlet />;
    },
  });
  const homeRoute = createRoute({
    component: DirtyFormPage,
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const otherRoute = createRoute({
    component: function OtherPage() {
      return <div>Other page</div>;
    },
    getParentRoute: () => rootRoute,
    path: "/other",
  });
  const router = createRouter({
    defaultPendingMinMs: 0,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([homeRoute, otherRoute]),
  });
  await router.load();
  await using view = renderResource(<RouterProvider router={router} />);

  fireEvent.change(view.getByLabelText("Note"), { target: { value: "hello" } });
  fireEvent.click(view.getByRole("button", { name: "Leave" }));

  await vi.waitFor(() => {
    expect(view.getByRole("alertdialog")).toBeTruthy();
  });
  expect(view.queryByText("Other page")).toBeNull();

  fireEvent.click(view.getByRole("button", { name: "Keep editing" }));
  await vi.waitFor(() => {
    expect(view.queryByRole("alertdialog")).toBeNull();
  });
  expect(view.queryByText("Other page")).toBeNull();

  fireEvent.click(view.getByRole("button", { name: "Leave" }));
  await vi.waitFor(() => {
    expect(view.getByRole("alertdialog")).toBeTruthy();
  });
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  await vi.waitFor(() => {
    expect(view.getByText("Other page")).toBeTruthy();
  });
});
