import { QueryClientProvider } from "@raf-query/react";
import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { createElement } from "react";
import { expect, test } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { browserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { useBrowserPushCapability } from "./use-browser-push-capability";

test("the server renders push capability as pending without detecting", async () => {
  await using stub = stubQueryClientResource(
    async (query) => {
      throw new Error(`unexpected query ${getFunctionName(query)}`);
    },
    { isServer: true },
  );
  const handle = stub.queryClient.prefetch(browserPushCapabilityQuery, "baby-smith");
  const hook = renderHook(() => useBrowserPushCapability(handle), {
    wrapper: (props) =>
      createElement(QueryClientProvider, { client: stub.queryClient }, props.children),
  });
  await using _hook = makeResource({}, () => hook.unmount());

  const [capability, refetch] = hook.result.current;

  expect(capability).toBeNull();
  await expect(refetch()).resolves.toBeUndefined();
  expect(stub.queryClient.getData(browserPushCapabilityQuery, "baby-smith")).toBeUndefined();
});
