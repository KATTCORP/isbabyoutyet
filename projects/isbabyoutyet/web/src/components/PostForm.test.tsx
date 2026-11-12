import { fireEvent } from "@testing-library/react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { ConvexProvider } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { SubmitButton } from "@/components/Form";
import { PostForm, useFormPost } from "@/components/PostForm";
import { formPost } from "@/lib/form-post";
import type { TranslationFunction } from "@/lib/i18n";
import { createConvexTestHarness } from "@/test/convexTestHarness";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { htmlElement, htmlInput } from "@/test/htmlElement";
import { renderWithConvexTest } from "@/test/renderWithConvexTest";

type NoteArgs = { author: string; postedByBrowser: boolean; text: string };

const addNote = makeFunctionReference<"mutation", NoteArgs, null>("notes:add");

function noteFields(t: TranslationFunction) {
  return z.object({ text: z.string().trim().min(1, t("Message is required")).max(20) });
}

const notePost = formPost({
  args: (input) => ({
    author: input.carried.author,
    postedByBrowser: input.request !== null,
    text: input.fields.text,
  }),
  carried: z.object({ author: z.string().min(1) }),
  fields: noteFields,
  id: "note",
  landing: () => "/notes",
  mutation: addNote,
  page: () => "/notes",
  remembers: () => [],
});

function NoteForm(props: {
  onSend: (args: NoteArgs) => Promise<void>;
  restore: (() => { text: string }) | null;
}) {
  const post = useFormPost(notePost, {
    action: { url: "/_serverFn/add-note" },
    carried: { author: "ada" },
    defaultValues: { text: "" },
    restore: props.restore,
  });
  return (
    <PostForm failedMessage="Couldn't save your note" handleSubmit={props.onSend} post={post}>
      <FormField
        control={post.form.control}
        name="text"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Note</FormLabel>
            <FormControl>
              <Input {...post.native("text")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <SubmitButton form="context" IconComponent={null} iconPosition="start">
        Save
      </SubmitButton>
    </PostForm>
  );
}

async function renderNoteForm(
  harness: ConvexTestHarness,
  onSend: (args: NoteArgs) => Promise<void>,
) {
  return await renderWithConvexTest({
    harness,
    ui: <NoteForm onSend={onSend} restore={null} />,
    wrap: null,
  });
}

test("the server's HTML is a form the browser can post and check by itself", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const page = document.createElement("div");
  page.innerHTML = renderToString(
    <ConvexProvider
      // @ts-expect-error — integration client is not ConvexReactClient
      client={harness.convexClient}
    >
      <NoteForm onSend={async () => undefined} restore={() => ({ text: "a draft" })} />
    </ConvexProvider>,
  );
  const form = htmlElement(page.querySelector("form"));

  expect(form.getAttribute("action")).toBe("/_serverFn/add-note");
  expect(form.getAttribute("method")).toBe("post");
  expect(form.hasAttribute("novalidate")).toBe(false);
  expect(htmlInput(form.querySelector('input[name="author"]')).type).toBe("hidden");
  expect(htmlInput(form.querySelector('input[name="author"]')).value).toBe("ada");
  const text = htmlInput(form.querySelector('input[name="text"]'));
  // What only a browser knows is not in the server's HTML.
  expect(text.value).toBe("");
  expect(text.required).toBe(true);
  expect(text.maxLength).toBe(20);
  expect(htmlElement(form.querySelector("#note-failed")).textContent).toBe(
    "Couldn't save your note",
  );
});

test("once hydrated, the schema checks the fields instead of the browser", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderNoteForm(harness, async () => undefined);
  const form = htmlElement(view.container.querySelector("form"));

  expect(form.hasAttribute("novalidate")).toBe(true);

  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(view.getByText("Message is required")).toBeTruthy();
  });
});

test("with JS, the page sends the arguments the form's description builds", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  const onSend = vi.fn(async () => undefined);
  await using view = await renderNoteForm(harness, onSend);

  fireEvent.change(view.getByLabelText("Note"), { target: { value: "  hello  " } });
  fireEvent.click(view.getByRole("button", { name: "Save" }));

  await vi.waitFor(() => {
    expect(onSend).toHaveBeenCalledExactlyOnceWith({
      author: "ada",
      postedByBrowser: false,
      text: "hello",
    });
  });
});

test("once the page's JS runs, the fields start as what only the browser knows", async () => {
  await using harness = await createConvexTestHarness({ identity: null });
  await using view = await renderWithConvexTest({
    harness,
    ui: <NoteForm onSend={async () => undefined} restore={() => ({ text: "a draft" })} />,
    wrap: null,
  });

  expect(htmlInput(view.getByLabelText("Note")).value).toBe("a draft");
});
