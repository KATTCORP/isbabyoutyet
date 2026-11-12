import { getData } from "@raf-query/react";
import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { visitorTag } from "@isbabyoutyet/backend/src/visitorId";
import { stubNoWindowResource } from "@/test/stubJsdomWindow";
import { stubQueryClientResource } from "@/test/stubQueryClient";
import { visitorTagQuery } from "./visitor-tag";
import { clearBrowserCookies, setBrowserCookie } from "@/test/browserCookies";
import { fetchQueryData, prefetchQuery } from "@/test/loadQuery";

function storedVisitorIdResource(visitorId: string | null) {
  clearBrowserCookies();
  if (visitorId !== null) {
    setBrowserCookie("visitor-id", visitorId);
  }
  return makeResource({}, clearBrowserCookies);
}

const rejectConvexQueries: Parameters<typeof stubQueryClientResource>[0] = async (query) => {
  throw new Error(`unexpected query ${getFunctionName(query)}`);
};

/** The page's baby query, answering one baby under its public id. */
const answerBaby: Parameters<typeof stubQueryClientResource>[0] = async (query) => {
  if (getFunctionName(query) !== "baby:getByPublicId") {
    throw new Error(`unexpected query ${getFunctionName(query)}`);
  }
  return { _id: "baby-1" };
};

test("the browser hashes its stored visitor id with the baby's id", async () => {
  using _visitor = storedVisitorIdResource("visitor-1");
  await using stub = stubQueryClientResource(answerBaby, { isServer: false });

  const tag = await fetchQueryData(stub.queryClient, visitorTagQuery, "baby-smith");

  expect(tag).toBe(await visitorTag({ babyId: "baby-1", visitorId: "visitor-1" }));
});

test("a visitor who has never posted has no tag, and the baby isn't read for one", async () => {
  using _visitor = storedVisitorIdResource(null);
  await using stub = stubQueryClientResource(rejectConvexQueries, { isServer: false });

  expect(await fetchQueryData(stub.queryClient, visitorTagQuery, "baby-smith")).toBeNull();
});

test("a baby that doesn't exist has no tag", async () => {
  using _visitor = storedVisitorIdResource("visitor-1");
  await using stub = stubQueryClientResource(() => Promise.resolve(null), { isServer: false });

  expect(await fetchQueryData(stub.queryClient, visitorTagQuery, "no-such-baby")).toBeNull();
});

test("the server never hashes, so the tag stays pending through SSR", async () => {
  using _visitor = storedVisitorIdResource("visitor-1");
  using _window = stubNoWindowResource();
  await using stub = stubQueryClientResource(rejectConvexQueries, { isServer: true });

  await prefetchQuery(stub.queryClient, visitorTagQuery, "baby-smith");
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(getData(stub.queryClient, visitorTagQuery, "baby-smith")).toBeUndefined();
});
