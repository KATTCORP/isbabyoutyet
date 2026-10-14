import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noConvexQueryHooks } from "./no-convex-query-hooks.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-convex-query-hooks", noConvexQueryHooks, {
  valid: [
    `import { useMutation } from "convex/react";`,
    `import { useQuery } from "@raf-query/react";`,
  ],
  invalid: [
    {
      code: `import { useQuery } from "convex/react";`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `import { usePaginatedQuery } from "convex/react";`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `import { useQuery } from "convex/react";
     useQuery(api.profile.get, {});`,
      errors: [{ messageId: "banned" }, { messageId: "banned" }],
    },
    {
      code: `import { useQuery as useConvexQuery } from "convex/react";
     useConvexQuery(api.profile.get, {});`,
      errors: [{ messageId: "banned" }, { messageId: "banned" }],
    },
  ],
});
