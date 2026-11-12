import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-untyped-object-literal", plugin.rules["no-untyped-object-literal"], {
  valid: [
    // A variable names its type, by annotation or `satisfies`.
    `const input: TimelineInput = { from: null, numItems: 20 };`,
    `const input = { from: null, numItems: 20 } satisfies TimelineInput;`,
    `const themes = { dark: ".dark", light: "" } as const satisfies Record<Theme, string>;`,
    `let input: TimelineInput = { from: null };`,
    // A function names what it returns.
    `function timelineInput(opts: Opts): TimelineInput {
       return { from: opts.from, numItems: 20 };
     }`,
    `function timelineInput(opts: Opts) {
       return { from: opts.from, numItems: 20 } satisfies TimelineInput;
     }`,
    `const timelineInput = (opts: Opts): TimelineInput => ({ from: opts.from });`,
    `const timelineInput = (opts: Opts) => ({ from: opts.from }) satisfies TimelineInput;`,
    `const timelineInput: (opts: Opts) => TimelineInput = (opts) => ({ from: opts.from });`,
    // The parameter a literal or a callback is passed to types it.
    `swr(timelineQuery, { from: null, numItems: 20 });`,
    `const ids = items.map((item) => ({ id: item.id }));`,
    `queryOptions({ queryFn: () => ({ ok: true }), queryKey: ["ok"] });`,
    `const handler = query({ handler: async (ctx) => { return { ok: true }; } });`,
    `useEffect(() => { return () => {}; });`,
    // A callback's return is the callback's, not the enclosing function's.
    `function ids(items: Array<Item>): Array<Id> {
       return items.map((item) => { return { id: item.id }; });
     }`,
    // Not an object literal.
    `const count = 1;`,
    `function count() { return 1; }`,
    `const { a } = source;`,
    `const copy = input;`,
  ],
  invalid: [
    {
      code: `const input = { from: null, numItems: 20 };`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `const TRANSITION = { damping: 32, type: "spring" } as const;`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `export const DEMO_USER = ({ name: "Demo" });`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `let input = { from: null };`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `export function timelineInput(opts: { from: string | null; publicId: string }) {
               return {
                 args: { babyId: opts.publicId, context: LINKED_ITEM_CONTEXT },
                 from: opts.from,
                 numItems: TIMELINE_PAGE_SIZE,
               };
             }`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `async function load() { return { ok: true } as const; }`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `const timelineInput = (opts: Opts) => ({ from: opts.from });`,
      errors: [{ messageId: "untyped" }],
    },
    {
      code: `const timelineInput = function (opts: Opts) { return { from: opts.from }; };`,
      errors: [{ messageId: "untyped" }],
    },
    {
      // Each loose return is reported, and the callback's own is not.
      code: `function pick(first: boolean) {
               if (first) {
                 return { which: "first" };
               }
               list.forEach((item) => { return { item }; });
               return { which: "second" };
             }`,
      errors: [{ messageId: "untyped" }, { messageId: "untyped" }],
    },
    {
      // A function nested in a typed one is still on its own.
      code: `function outer(): Result {
               function inner() { return { ok: true }; }
               return inner();
             }`,
      errors: [{ messageId: "untyped" }],
    },
  ],
});
