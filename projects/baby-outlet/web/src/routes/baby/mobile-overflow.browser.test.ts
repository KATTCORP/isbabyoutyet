import { commands } from "vitest/browser";
import { expect, test } from "vitest";

type PageCheckOptions = {
  expectedText: string | null;
  heading: string;
  path: string;
};

type OverflowResult = {
  documentWidth: number;
  viewportWidth: number;
  widest: {
    className: string;
    right: number;
    tagName: string;
  } | null;
};

declare module "vitest/browser" {
  interface BrowserCommands {
    measureMobileOverflow: (options: PageCheckOptions) => Promise<OverflowResult>;
  }
}

const fixtures = [
  {
    expectedText: null,
    heading: "Is Willow Brooks out yet?",
    path: "/baby/willow-brooks",
  },
  {
    expectedText: null,
    heading: "Is Baby Waiting out yet?",
    path: "/baby/baby-waiting",
  },
  {
    expectedText: "layout-stress.example",
    heading: "Is Baby Born out yet?",
    path: "/baby/baby-born",
  },
] as const;

for (const fixture of fixtures) {
  test(`${fixture.path} fits within a 393px viewport`, async () => {
    const result = await commands.measureMobileOverflow({
      expectedText: fixture.expectedText,
      heading: fixture.heading,
      path: fixture.path,
    });

    expect(
      result.documentWidth,
      `widest element: ${JSON.stringify(result.widest)}`,
    ).toBeLessThanOrEqual(result.viewportWidth);
  });
}
