import { dehydrate, getData, QueryClientProvider } from "@raf-query/react";
import { getFunctionName } from "convex/server";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { stubNoWindowResource } from "@/test/stubJsdomWindow";
import { prefetchQuery } from "@/test/loadQuery";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { useBrowserPushCapability } from "./use-browser-push-capability";

test("the server renders push capability as pending without detecting or sending it", async () => {
  using _window = stubNoWindowResource();
  await using stub = stubQueryClientResource(
    async (query) => {
      throw new Error(`unexpected query ${getFunctionName(query)}`);
    },
    { isServer: true },
  );
  // The loader's prefetch: an `ssr: false` query's handle, not started.
  const handle = await prefetchQuery(stub.queryClient, browserPushCapabilityQuery, "baby-smith");
  const rendered: Array<ReturnType<typeof useBrowserPushCapability>> = [];
  function Probe() {
    rendered.push(useBrowserPushCapability(handle));
    return null;
  }

  renderToString(
    createElement(QueryClientProvider, { client: stub.queryClient }, createElement(Probe)),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(rendered.map((result) => result[0])).toEqual([null]);
  expect(getData(stub.queryClient, browserPushCapabilityQuery, "baby-smith")).toBeUndefined();
  // The browser detects it itself once it renders.
  expect(dehydrate(stub.queryClient).entries).toEqual([]);
});
