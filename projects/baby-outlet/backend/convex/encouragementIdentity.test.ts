import { expect, test } from "vitest";
import {
  encouragementHasUserId,
  encouragementIsMine,
  storedEncouragementAuthor,
  storedEncouragementAuthorFromCaller,
} from "./encouragementIdentity";

test("storedEncouragementAuthor returns the required union field", () => {
  expect(
    storedEncouragementAuthor({
      author: { type: "user", userId: "alice", visitorId: "v1" },
      visitorId: "v1",
    }),
  ).toEqual({ type: "user", userId: "alice", visitorId: "v1" });
  expect(
    storedEncouragementAuthor({
      author: { type: "visitor", visitorId: "v1" },
      visitorId: "v1",
    }),
  ).toEqual({ type: "visitor", visitorId: "v1" });
});

test("storedEncouragementAuthorFromCaller always stores the browser visitor id", () => {
  expect(
    storedEncouragementAuthorFromCaller(
      { type: "user", userId: "alice", visitorId: null },
      "browser-1",
    ),
  ).toEqual({ type: "user", userId: "alice", visitorId: "browser-1" });
  expect(storedEncouragementAuthorFromCaller({ type: "visitor", visitorId: "v1" }, "v1")).toEqual({
    type: "visitor",
    visitorId: "v1",
  });
  expect(storedEncouragementAuthorFromCaller(null, "v1")).toEqual({
    type: "visitor",
    visitorId: "v1",
  });
});

test("encouragementHasUserId is true only for the user variant", () => {
  expect(
    encouragementHasUserId({
      author: { type: "user", userId: "alice", visitorId: "v1" },
      visitorId: "v1",
    }),
  ).toBe(true);
  expect(
    encouragementHasUserId({
      author: { type: "visitor", visitorId: "v1" },
      visitorId: "v1",
    }),
  ).toBe(false);
});

test("a signed-in author matches by user id even on a new visitor id", () => {
  expect(
    encouragementIsMine(
      {
        author: { type: "user", userId: "alice", visitorId: "old-browser" },
        visitorId: "old-browser",
      },
      { type: "user", userId: "alice", visitorId: "new-browser" },
    ),
  ).toBe(true);
});

test("a signed-in author does not match another user's comment", () => {
  expect(
    encouragementIsMine(
      {
        author: { type: "user", userId: "bob", visitorId: "bob-browser" },
        visitorId: "bob-browser",
      },
      { type: "user", userId: "alice", visitorId: "alice-browser" },
    ),
  ).toBe(false);
});

test("a signed-in author still matches unclaimed guest posts from this browser", () => {
  expect(
    encouragementIsMine(
      {
        author: { type: "visitor", visitorId: "same-browser" },
        visitorId: "same-browser",
      },
      { type: "user", userId: "alice", visitorId: "same-browser" },
    ),
  ).toBe(true);
});

test("a guest only matches their visitor id", () => {
  expect(
    encouragementIsMine(
      { author: { type: "visitor", visitorId: "v1" }, visitorId: "v1" },
      { type: "visitor", visitorId: "v1" },
    ),
  ).toBe(true);
  expect(
    encouragementIsMine(
      {
        author: { type: "user", userId: "alice", visitorId: "v1" },
        visitorId: "v1",
      },
      { type: "visitor", visitorId: "v2" },
    ),
  ).toBe(false);
  expect(
    encouragementIsMine(
      {
        author: { type: "user", userId: "alice", visitorId: "v1" },
        visitorId: "v1",
      },
      null,
    ),
  ).toBe(false);
});
