import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noBeforeLoad } from "./no-before-load.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-before-load", noBeforeLoad, {
  valid: [
    `export const Route = createFileRoute("/_auth")({
       loader: async (opts) => {
         const [, data] = await load(opts.context.queryClient, { me: swr(meQuery, {}) });
         if (!data.me) {
           throw redirect({ to: "/auth/login" });
         }
       },
     });`,
    // Reading the option's name elsewhere is not setting it.
    `const { beforeLoad } = options;`,
    `type RouteOptions = { beforeLoad: () => void };`,
  ],
  invalid: [
    {
      code: `export const Route = createFileRoute("/_auth")({
        beforeLoad: async (opts) => {
          if (!(await signedIn(opts.context))) {
            throw redirect({ to: "/auth/login" });
          }
        },
      });`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `export const Route = createRootRouteWithContext<Context>()({
        async beforeLoad() {
          return { locale: await detectLocale() };
        },
      });`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `export const Route = createFileRoute("/admin")({ "beforeLoad": guard });`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `export const Route = createFileRoute("/admin")({ beforeLoad });`,
      errors: [{ messageId: "banned" }],
    },
    {
      code: `route.update({ beforeLoad: guard });`,
      errors: [{ messageId: "banned" }],
    },
  ],
});
