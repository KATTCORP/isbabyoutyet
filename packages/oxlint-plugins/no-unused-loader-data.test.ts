import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { noUnusedLoaderData } from "./no-unused-loader-data.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

function unusedQuery(key: string) {
  return { messageId: "unusedQuery", data: { key } };
}

tester.run("no-unused-loader-data", noUnusedLoaderData, {
  valid: [
    // Keyed `allKeyed` handles read with `useQuery` and handed to a child.
    `export const Route = createFileRoute("/dashboard")({
       loader: async (opts) => {
         const queryClient = opts.context.queryClient;
         return await allKeyed({
           babies: queryClient.ensure(convexQuery(api.baby.listByUser), {}),
           onboarding: queryClient.ensure(convexQuery(api.onboarding.getMine), {}),
         });
       },
     });
     function DashboardPage() {
       const loaderData = Route.useLoaderData();
       const [babies] = useQuery(convexQuery(api.baby.listByUser), loaderData.babies);
       return <OnboardingHost onboarding={loaderData.onboarding} />;
     }`,
    // Spread of an awaited `allKeyed` plus extra keys; one read in `head`.
    `export const Route = createFileRoute("/baby/$publicId")({
       loader: async (opts) => {
         const queryClient = opts.context.queryClient;
         const babyDoc = queryClient.getData(convexQuery(api.baby.getByPublicId), {});
         const browserPush = queryClient.prefetch(browserPushCapabilityQuery, opts.params.publicId);
         const data = await allKeyed({
           baby: queryClient.ensure(convexQuery(api.baby.getByPublicId), {}),
         });
         return { babyDoc, browserPush, ...data };
       },
       head: (opts) => ({ meta: [{ title: opts.loaderData?.babyDoc.name }] }),
       component: BabyPage,
     });
     function BabyPage() {
       const loaderData = Route.useLoaderData();
       if (!loaderData) {
         return null;
       }
       const [baby] = useQuery(convexQuery(api.baby.getByPublicId), loaderData.baby);
       return <Push browserPush={loaderData.browserPush} />;
     }`,
    // The loader data is a single handle, passed straight to `useQuery`.
    `export const Route = createFileRoute("/admin/users")({
       loader: async (opts) => {
         return await opts.context.queryClient.ensure(convexPaginatedQuery(api.admin.listUsers), {
           args: {},
           numItems: 20,
         });
       },
     });
     function Page() {
       const [users] = useQuery(convexPaginatedQuery(api.admin.listUsers), Route.useLoaderData());
       return null;
     }`,
    // A key read through an object-literal hand-off.
    `export const Route = createFileRoute("/settings")({
       loader: async (opts) => ({
         coParentsList: await opts.context.queryClient.ensure(convexQuery(api.coParents.listForBaby), {}),
       }),
     });
     function Page() {
       const loaderData = Route.useLoaderData();
       return <SettingsPanel coParents={{ listing: loaderData.coParentsList }} />;
     }`,
    // Destructuring and `select`.
    `export const Route = createFileRoute("/x")({
       loader: async () => ({ a: 1, b: 2, c: 3 }),
     });
     function Page() {
       const { a, b } = Route.useLoaderData();
       const c = Route.useLoaderData({ select: (data) => data.c });
       return a + b + c;
     }`,
    // Loader data that escapes as a whole counts as fully read.
    `export const Route = createFileRoute("/x")({
       loader: async () => ({ a: 1, b: 2 }),
     });
     function Page() {
       return <View data={Route.useLoaderData()} />;
     }`,
    `export const Route = createFileRoute("/x")({
       loader: async () => ({ a: 1 }),
     });
     function Page() {
       const loaderData = Route.useLoaderData();
       return <View {...loaderData} />;
     }`,
    `export const Route = createFileRoute("/x")({
       loader: async () => ({ a: 1 }),
     });
     function Page(props) {
       return Route.useLoaderData()[props.key];
     }`,
    // `getRouteApi` reads can't be tied to one route, so they count for all.
    `export const Route = createFileRoute("/x")({
       loader: async () => ({ a: 1 }),
     });
     const routeApi = getRouteApi("/x");
     function Page() {
       return routeApi.useLoaderData().a;
     }`,
    // A destructured `loaderData` parameter in `head`.
    `export const Route = createFileRoute("/x")({
       loader: async () => ({ title: "Hi" }),
       head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title }] }),
     });`,
    // Loaders that return nothing, and non-route `loader` keys.
    `export const Route = createFileRoute("/x")({
       loader: async (opts) => {
         await opts.context.queryClient.ensure(convexQuery(api.profile.get), {});
       },
     });`,
    `const config = { loader: async () => ({ unused: 1 }) };`,
    `export const Route = createRootRouteWithContext<RouterContext>()({
       loader: () => ({ locale: "en" }),
       component: function Root() {
         return Route.useLoaderData().locale;
       },
     });`,
  ],
  invalid: [
    {
      code: `export const Route = createFileRoute("/dashboard")({
         loader: async (opts) => {
           const queryClient = opts.context.queryClient;
           return await allKeyed({
             babies: queryClient.ensure(convexQuery(api.baby.listByUser), {}),
             onboarding: queryClient.ensure(convexQuery(api.onboarding.getMine), {}),
           });
         },
       });
       function Page() {
         const loaderData = Route.useLoaderData();
         const [babies] = useQuery(convexQuery(api.baby.listByUser), loaderData.babies);
         return null;
       }`,
      errors: [unusedQuery("onboarding")],
    },
    {
      code: `export const Route = createFileRoute("/share")({
         loader: async (opts) => {
           const data = await allKeyed({
             baby: opts.context.queryClient.ensure(convexQuery(api.baby.getByPublicId), {}),
             myAccess: opts.context.queryClient.ensure(convexQuery(api.coParents.myAccess), {}),
           });
           return { ...data, shareLink: "https://example.com" };
         },
       });
       function Page() {
         const loaderData = Route.useLoaderData();
         return <Copy babyHandle={loaderData.baby} />;
       }`,
      errors: [unusedQuery("myAccess"), { messageId: "unusedKey", data: { key: "shareLink" } }],
    },
    {
      // Handles bound to a local and returned by shorthand.
      code: `export const Route = createFileRoute("/photo")({
         loader: async (opts) => {
           const baby = await opts.context.queryClient.ensure(convexQuery(api.baby.getByPublicId), {});
           const visitorTag = opts.context.queryClient.prefetch(visitorTagQuery, baby.data._id);
           return { baby, visitorTag };
         },
       });
       function Page() {
         const loaderData = Route.useLoaderData();
         return <Photo baby={loaderData.baby} />;
       }`,
      errors: [unusedQuery("visitorTag")],
    },
    {
      // No component reads loader data at all.
      code: `export const Route = createFileRoute("/x")({
         loader: async (opts) => {
           const queryClient = opts.context.queryClient;
           const profile = await queryClient.ensure(convexQuery(api.profile.get), {});
           return { profile };
         },
         component: function Page() {
           return null;
         },
       });`,
      errors: [unusedQuery("profile")],
    },
    {
      // A whole-handle loader whose data is never read.
      code: `export const Route = createFileRoute("/admin/users")({
         loader: async (opts) => {
           return await opts.context.queryClient.ensure(convexPaginatedQuery(api.admin.listUsers), {
             args: {},
             numItems: 20,
           });
         },
         component: function Page() {
           return null;
         },
       });`,
      errors: [{ messageId: "unusedQueryValue" }],
    },
    {
      code: `export const Route = createFileRoute("/x")({
         loader: () => computeStuff(),
       });`,
      errors: [{ messageId: "unusedValue" }],
    },
    {
      // Null checks are not reads.
      code: `export const Route = createFileRoute("/x")({
         loader: async () => ({ a: 1 }),
       });
       function Page() {
         const loaderData = Route.useLoaderData();
         return loaderData ? null : null;
       }`,
      errors: [{ messageId: "unusedKey", data: { key: "a" } }],
    },
    {
      // Reads are attributed to the route they come from.
      code: `export const Route = createFileRoute("/a")({
         loader: async () => ({ a: 1 }),
       });
       export const OtherRoute = createRoute({
         loader: async () => ({ b: 1 }),
       });
       function Page() {
         return OtherRoute.useLoaderData().b;
       }`,
      errors: [{ messageId: "unusedKey", data: { key: "a" } }],
    },
    {
      // Every return path is checked; keys are read via `select` and destructuring.
      code: `export const Route = createFileRoute("/x")({
         loader: async (opts) => {
           if (opts.params.id) {
             return { a: 1, b: 2 };
           }
           return { a: 1, c: 3 };
         },
       });
       function Page() {
         const a = Route.useLoaderData({ select: (data) => data.a });
         const { b } = Route.useLoaderData();
         return a + b;
       }`,
      errors: [{ messageId: "unusedKey", data: { key: "c" } }],
    },
  ],
});
