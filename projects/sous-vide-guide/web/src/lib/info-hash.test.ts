import { describe, expect, it } from "vitest";

import { infoCutIdFromHash, infoHash } from "@/lib/info-hash";

describe("info hash", () => {
  it("round-trips a cut id through the drawer hash", () => {
    expect(infoHash("pork-chop")).toBe("info-pork-chop");
    expect(infoCutIdFromHash(infoHash("pork-chop"))).toBe("pork-chop");
  });

  it("treats card and category anchors as a closed drawer", () => {
    expect(infoCutIdFromHash("")).toBe("");
    expect(infoCutIdFromHash("egg")).toBe("");
    expect(infoCutIdFromHash("pork")).toBe("");
  });
});
