import { expect, test } from "vitest";
import { BabyPageIndex } from "@/routes/baby/$publicId/index";
import { renderResource } from "@/test/renderResource";

test("baby page index renders nothing so the layout owns the page chrome", async () => {
  await using view = renderResource(<BabyPageIndex />);
  expect(view.container.childNodes.length).toBe(0);
});
