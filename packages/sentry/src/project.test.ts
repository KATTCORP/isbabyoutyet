import { expect, test } from "vitest";
import { personalProjectSlug } from "./project.js";

test("personal project slugs use the personal- prefix", () => {
  expect(personalProjectSlug("isbabyoutyet")).toBe("personal-isbabyoutyet");
  expect(personalProjectSlug("sous-vide-guide")).toBe("personal-sous-vide-guide");
  expect(personalProjectSlug("personal-isbabyoutyet")).toBe("personal-isbabyoutyet");
});
