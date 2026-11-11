import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noAsyncBeforeLoad } from "./no-async-before-load.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("no-async-before-load", noAsyncBeforeLoad, {
  valid: [
    `export const Route = createFileRoute("/_auth")({
       loader: async (opts) => {
         const [, data] = await load(opts.context.queryClient, { me: swr(meQuery, {}) });
         if (!data.me) {
           throw redirect({ to: "/auth/login" });
         }
       },
     });`,
    // A redirect the URL alone decides.
    `export const Route = createFileRoute("/admin/")({
       beforeLoad: (opts) => {
         throw redirect({ replace: true, to: "/admin/" + opts.search.tab });
       },
     });`,
    `export const Route = createFileRoute("/")({
       beforeLoad: (ctx) => {
         if (ctx.search.info !== "") {
           throw redirect({ hash: infoHash(ctx.search.info), to: "/" });
         }
       },
     });`,
    // Route context computed on the spot: the calls are inside the literal.
    `export const Route = createRootRoute({ beforeLoad: () => ({ locale: getLocale() }) });`,
    `export const Route = createRootRoute({
       beforeLoad() {
         const locale = getLocale();
         return { locale } satisfies LocaleContext;
       },
     });`,
    // A function inside it may return what it likes.
    `export const Route = createRootRoute({
       beforeLoad: () => ({ reload: () => fetchAgain() }),
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
      errors: [{ messageId: "async" }],
    },
    {
      code: `export const Route = createRootRouteWithContext<Context>()({
        async beforeLoad() {
          return { locale: getLocale() };
        },
      });`,
      errors: [{ messageId: "async" }],
    },
    // Not async, and still a promise for the router to wait for.
    {
      code: `export const Route = createFileRoute("/_auth")({
        beforeLoad: (opts) => resolveAuthGuard(opts.context),
      });`,
      errors: [{ messageId: "returnsCall" }],
    },
    {
      code: `export const Route = createFileRoute("/_auth")({
        beforeLoad: (opts) => {
          if (isServer) {
            return getAuth().then((token) => ({ token }));
          }
          return { token: undefined };
        },
      });`,
      errors: [{ messageId: "returnsCall" }],
    },
    {
      code: `export const Route = createFileRoute("/_auth")({
        beforeLoad: (opts) => (opts.cause === "enter" ? loadProfile(opts) : undefined),
      });`,
      errors: [{ messageId: "returnsCall" }],
    },
    // The rule can't see into a function defined elsewhere.
    {
      code: `export const Route = createFileRoute("/admin")({ "beforeLoad": guard });`,
      errors: [{ messageId: "notInline" }],
    },
    {
      code: `export const Route = createFileRoute("/admin")({ beforeLoad });`,
      errors: [{ messageId: "notInline" }],
    },
    {
      code: `route.update({ beforeLoad: guard });`,
      errors: [{ messageId: "notInline" }],
    },
  ],
});
