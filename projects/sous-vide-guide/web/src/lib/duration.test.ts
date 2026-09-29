import { describe, expect, it } from "vitest";

import { formatDurationMinutes, formatDurationRange } from "@/lib/duration";

describe("formatDurationMinutes", () => {
  it("formats minutes and hours with locale decimals", () => {
    expect(formatDurationMinutes(45, "en-GB")).toBe("45 min");
    expect(formatDurationMinutes(60, "en-GB")).toBe("1 h");
    expect(formatDurationMinutes(90, "en-GB")).toBe("1.5 h");
    expect(formatDurationMinutes(90, "sv")).toBe("1,5 h");
    expect(formatDurationMinutes(90, "en-US")).toBe("1.5 h");
  });
});

describe("formatDurationRange", () => {
  it("collapses identical bounds", () => {
    expect(formatDurationRange({ max: 60, min: 60 }, "en-GB")).toBe("1 h");
  });

  it("renders inclusive windows", () => {
    expect(formatDurationRange({ max: 1080, min: 840 }, "en-GB")).toBe("14 h–18 h");
  });
});
