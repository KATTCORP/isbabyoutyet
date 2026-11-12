import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { Controller } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { Form, useZodForm } from "@/components/Form";
import { useRestoredFields } from "@/lib/use-restored-fields";
import { htmlInput } from "@/test/htmlElement";
import { renderResource } from "@/test/renderResource";

type Note = { text: string; title: string };

function NoteForm(props: { read: (() => Note) | null }) {
  const form = useZodForm({
    defaultValues: { text: "", title: "Untitled" },
    schema: z.object({ text: z.string(), title: z.string() }),
  });
  useRestoredFields({
    formRef: form.formRef,
    getValues: form.getValues,
    read: props.read,
    reset: form.reset,
  });
  return (
    <Form form={form} handleSubmit={async () => undefined}>
      <Controller
        control={form.control}
        name="title"
        render={({ field }) => <input aria-label="Title" {...field} />}
      />
      <Controller
        control={form.control}
        name="text"
        render={({ field }) => <input aria-label="Text" {...field} />}
      />
    </Form>
  );
}

/**
 * The server's HTML for the form, in a page the test can type into before
 * React runs. In `StrictMode` here and below, as the app is: React then
 * runs a new component's effects twice in development.
 */
function serverPage(read: (() => Note) | null) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <StrictMode>
      <NoteForm read={read} />
    </StrictMode>,
  );
  document.body.append(container);
  return container;
}

test("the server's HTML has none of what the browser stores", () => {
  const page = serverPage(() => ({ text: "a draft", title: "My note" }));

  expect(htmlInput(page.querySelector('input[name="text"]')).value).toBe("");
  expect(htmlInput(page.querySelector('input[name="title"]')).value).toBe("Untitled");
  page.remove();
});

test("once React runs, the fields hold what the browser stored", () => {
  const container = serverPage(() => ({ text: "a draft", title: "My note" }));
  using view = renderResource(
    <StrictMode>
      <NoteForm read={() => ({ text: "a draft", title: "My note" })} />
    </StrictMode>,
    {
      container,
      hydrate: true,
    },
  );

  expect(htmlInput(view.getByLabelText("Text")).value).toBe("a draft");
  expect(htmlInput(view.getByLabelText("Title")).value).toBe("My note");
  container.remove();
});

test("what the visitor typed before React ran wins over what was stored", () => {
  const container = serverPage(() => ({ text: "a draft", title: "My note" }));
  htmlInput(container.querySelector('input[name="text"]')).value = "typed early";
  using view = renderResource(
    <StrictMode>
      <NoteForm read={() => ({ text: "a draft", title: "My note" })} />
    </StrictMode>,
    {
      container,
      hydrate: true,
    },
  );

  expect(htmlInput(view.getByLabelText("Text")).value).toBe("typed early");
  expect(htmlInput(view.getByLabelText("Title")).value).toBe("My note");
  container.remove();
});

test("a form that stores nothing still keeps what was typed early", () => {
  const container = serverPage(null);
  htmlInput(container.querySelector('input[name="text"]')).value = "typed early";
  using view = renderResource(
    <StrictMode>
      <NoteForm read={null} />
    </StrictMode>,
    { container, hydrate: true },
  );

  expect(htmlInput(view.getByLabelText("Text")).value).toBe("typed early");
  expect(htmlInput(view.getByLabelText("Title")).value).toBe("Untitled");
  container.remove();
});

test("the browser's storage is read once, though React runs a new effect twice in development", () => {
  // A second run would find the inputs not yet caught up with the first,
  // and take what they still say for something the visitor typed.
  const read = vi.fn(() => ({ text: "a draft", title: "My note" }));
  using view = renderResource(
    <StrictMode>
      <NoteForm read={read} />
    </StrictMode>,
    undefined,
  );

  expect(read).toHaveBeenCalledOnce();
  expect(htmlInput(view.getByLabelText("Text")).value).toBe("a draft");
  expect(htmlInput(view.getByLabelText("Title")).value).toBe("My note");
});
