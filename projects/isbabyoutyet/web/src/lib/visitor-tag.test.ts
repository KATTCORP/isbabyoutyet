import { getData } from "@raf-query/react";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { visitorTag } from "@isbabyoutyet/backend/src/visitorId";
import { stubNoWindowResource } from "@/test/stubJsdomWindow";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { visitorTagQuery } from "./visitor-tag";
import { fetchQueryData, prefetchQuery } from "@/test/loadQuery";

const VISITOR_ID_STORAGE_KEY = "encouragement-visitor-id";

function storedVisitorIdResource(visitorId: string | null) {
  if (visitorId === null) {
    localStorage.removeItem(VISITOR_ID_STORAGE_KEY);
  } else {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
  }
  return makeResource({}, () => {
    localStorage.removeItem(VISITOR_ID_STORAGE_KEY);
  });
}

const rejectConvexQueries: Parameters<typeof stubQueryClientResource>[0] = async (query) => {
  throw new Error(`unexpected query ${getFunctionName(query)}`);
};

test("the browser hashes its stored visitor id with the baby id", async () => {
  using _visitor = storedVisitorIdResource("visitor-1");
  await using stub = stubQueryClientResource(rejectConvexQueries, { isServer: false });

  const tag = await fetchQueryData(stub.queryClient, visitorTagQuery, "baby-1");

  expect(tag).toBe(await visitorTag({ babyId: "baby-1", visitorId: "visitor-1" }));
});

test("a visitor who has never posted has no tag", async () => {
  using _visitor = storedVisitorIdResource(null);
  await using stub = stubQueryClientResource(rejectConvexQueries, { isServer: false });

  expect(await fetchQueryData(stub.queryClient, visitorTagQuery, "baby-1")).toBeNull();
});

test("the server never hashes, so the tag stays pending through SSR", async () => {
  using _visitor = storedVisitorIdResource("visitor-1");
  using _window = stubNoWindowResource();
  await using stub = stubQueryClientResource(rejectConvexQueries, { isServer: true });

  await prefetchQuery(stub.queryClient, visitorTagQuery, "baby-1");
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(getData(stub.queryClient, visitorTagQuery, "baby-1")).toBeUndefined();
});
