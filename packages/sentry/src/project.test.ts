import { expect, test } from "vitest";
import { personalBackendProjectSlug, personalProjectSlug } from "./project.js";

test("personal project slugs use the personal- prefix", () => {
  expect(personalProjectSlug("isbabyoutyet")).toBe("personal-isbabyoutyet");
  expect(personalProjectSlug("sous-vide-guide")).toBe("personal-sous-vide-guide");
  expect(personalProjectSlug("personal-isbabyoutyet")).toBe("personal-isbabyoutyet");
});

test("Convex backends get a personal- backend project", () => {
  expect(personalBackendProjectSlug("isbabyoutyet")).toBe("personal-isbabyoutyet-backend");
  expect(personalBackendProjectSlug("personal-isbabyoutyet")).toBe("personal-isbabyoutyet-backend");
  expect(personalBackendProjectSlug("personal-isbabyoutyet-backend")).toBe(
    "personal-isbabyoutyet-backend",
  );
});
