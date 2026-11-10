import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noRafQueryWaterfall } from "./no-raf-query-waterfall.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-raf-query-waterfall", noRafQueryWaterfall, {
  valid: [
    `import { useQuery } from "@raf-query/react";`,
    `import { waterfallHandle } from "./local";
     waterfallHandle(postQuery, { id });`,
    `import * as raf from "@raf-query/react";
     raf.useQuery(postQuery, handle);`,
    `export { useQuery } from "@raf-query/react";`,
  ],
  invalid: [
    {
      code: `import { waterfallHandle } from "@raf-query/react";`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `import { useQuery, waterfallHandle } from "@raf-query/react";
     const handle = waterfallHandle(postQuery, { id });`,
      errors: [{ messageId: "banned" }, { messageId: "banned" }],
    },
    {
      code: `import { waterfallHandle as startQuery } from "@raf-query/react";
     startQuery(postQuery, { id });`,
      errors: [{ messageId: "banned" }, { messageId: "banned" }],
    },
    {
      code: `import * as raf from "@raf-query/react";
     raf.waterfallHandle(postQuery, { id });`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `export { waterfallHandle } from "@raf-query/react";`,
      errors: [{ messageId: "banned" }],
    },
  ],
});
