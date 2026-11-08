import { defineRule } from "@oxlint/plugins";

/**
 * Disallow the ES2023 "change array by copy" methods (`toSorted`, `toReversed`,
 * `toSpliced`) in browser code.
 *
 * Vite transpiles syntax but does not polyfill built-ins, so these crash on
 * Safari < 16 and Chrome < 110 (Sentry PERSONAL-ISBABYOUTYET-8). Copy, then
 * mutate the copy instead: `[...items].sort(compare)`.
 */

const BANNED = new Map([
  ["toReversed", "reverse"],
  ["toSorted", "sort"],
  ["toSpliced", "splice"],
]);

function memberName(property, computed) {
  if (!computed && property.type === "Identifier") {
    return property.name;
  }
  if (computed && property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  return null;
}

const noChangeArrayByCopy = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `toSorted` / `toReversed` / `toSpliced`, which older browsers do not ship",
    },
    schema: [],
  },

  create(context) {
    return {
      MemberExpression(node) {
        const name = memberName(node.property, node.computed);
        const replacement = name ? BANNED.get(name) : undefined;
        if (!replacement) {
          return;
        }
        context.report({
          node: node.property,
          message: `\`.${name}()\` crashes on older browsers (Safari < 16, Chrome < 110). Copy, then mutate the copy: \`[...items].${replacement}(…)\`.`,
        });
      },
    };
  },
});

export { noChangeArrayByCopy };
