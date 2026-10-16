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
    `import { useWaterfall } from "./local";
     useWaterfall(postQuery, { id });`,
    `import * as raf from "@raf-query/react";
     raf.useQuery(postQuery, handle);`,
    `export { useQuery } from "@raf-query/react";`,
  ],
  invalid: [
    {
      code: `import { useWaterfall } from "@raf-query/react";`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `import { useQuery, useWaterfall } from "@raf-query/react";
     const handle = useWaterfall(postQuery, { id });`,
      errors: [{ messageId: "banned" }, { messageId: "banned" }],
    },
    {
      code: `import { useWaterfall as startQuery } from "@raf-query/react";
     startQuery(postQuery, { id });`,
      errors: [{ messageId: "banned" }, { messageId: "banned" }],
    },
    {
      code: `import * as raf from "@raf-query/react";
     raf.useWaterfall(postQuery, { id });`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `export { useWaterfall } from "@raf-query/react";`,
      errors: [{ messageId: "banned" }],
    },
  ],
});
