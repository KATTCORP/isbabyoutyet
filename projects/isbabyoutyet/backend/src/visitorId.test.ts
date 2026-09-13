import { expect, test } from "vitest";
import { parseVisitorIdHint, VISITOR_ID_HINT_HEADER } from "./visitorId";

test("parseVisitorIdHint trims and rejects empty or oversized values", () => {
  expect(VISITOR_ID_HINT_HEADER).toBe("x-visitor-id");
  expect(parseVisitorIdHint(null)).toBeNull();
  expect(parseVisitorIdHint(undefined)).toBeNull();
  expect(parseVisitorIdHint("   ")).toBeNull();
  expect(parseVisitorIdHint("short")).toBeNull();
  expect(parseVisitorIdHint("x".repeat(129))).toBeNull();
  expect(parseVisitorIdHint("  visitor-1  ")).toBe("visitor-1");
});
