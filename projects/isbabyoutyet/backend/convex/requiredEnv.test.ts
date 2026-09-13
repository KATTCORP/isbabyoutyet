import { expect, test } from "vitest";
import { requiredEnv } from "./requiredEnv";

test("requiredEnv returns configured values", () => {
  expect(requiredEnv("EXAMPLE", "configured")).toBe("configured");
});

test("requiredEnv identifies missing configuration", () => {
  expect(() => requiredEnv("EXAMPLE", undefined)).toThrow(
    "EXAMPLE environment variable is not set",
  );
});
