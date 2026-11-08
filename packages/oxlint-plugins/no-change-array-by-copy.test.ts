import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-change-array-by-copy", plugin.rules["no-change-array-by-copy"], {
  valid: [
    `const sorted = [...items].sort((a, b) => a - b);`,
    `const reversed = items.slice().reverse();`,
    `items.splice(1, 1);`,
    `const sorted = Array.from(new Set(items)).sort();`,
  ],
  invalid: [
    {
      code: `const sorted = items.toSorted();`,
      errors: [{ message: /\[\.\.\.items\]\.sort/ }],
    },
    {
      code: `const reversed = items.toReversed();`,
      errors: [{ message: /\[\.\.\.items\]\.reverse/ }],
    },
    {
      code: `const rest = items.toSpliced(0, 1);`,
      errors: [{ message: /\[\.\.\.items\]\.splice/ }],
    },
    {
      code: `const sorted = items["toSorted"]((a, b) => a - b);`,
      errors: [{ message: /older browsers/ }],
    },
    {
      code: `const sorted = items?.toSorted();`,
      errors: [{ message: /older browsers/ }],
    },
  ],
});
