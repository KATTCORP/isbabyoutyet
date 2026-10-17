import { QueryClientProvider } from "@raf-query/react";
import { getFunctionName } from "convex/server";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { stubNoWindowResource } from "@/test/stubJsdomWindow";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { useBrowserPushCapability } from "./use-browser-push-capability";

test("the server renders push capability as pending without detecting", async () => {
  using _window = stubNoWindowResource();
  await using stub = stubQueryClientResource(
    async (query) => {
      throw new Error(`unexpected query ${getFunctionName(query)}`);
    },
    { isServer: true },
  );
  const handle = stub.queryClient.prefetch(browserPushCapabilityQuery, "baby-smith");
  const rendered: Array<ReturnType<typeof useBrowserPushCapability>> = [];
  function Probe() {
    rendered.push(useBrowserPushCapability(handle));
    return null;
  }

  renderToString(
    createElement(QueryClientProvider, { client: stub.queryClient }, createElement(Probe)),
  );

  expect(rendered.map((result) => result[0])).toEqual([null]);
  await expect(rendered[0]?.[1]()).resolves.toBeUndefined();
  expect(stub.queryClient.getData(browserPushCapabilityQuery, "baby-smith")).toBeUndefined();
});
