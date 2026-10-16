import { defineRule } from "@oxlint/plugins";

/**
 * Ban `useWaterfall` from `@raf-query/react`.
 *
 * It starts a query during render, so every call is a request waterfall.
 * Start queries in the route loader (`ensure` / `prefetch`) instead.
 *
 * Covers:
 * - `import { useWaterfall } from "@raf-query/react"` (and aliased)
 * - calls through that binding
 * - `import * as raf from "@raf-query/react"; raf.useWaterfall(…)`
 * - `export { useWaterfall } from "@raf-query/react"`
 */

const SOURCE = "@raf-query/react";
const NAME = "useWaterfall";

function moduleExportName(node) {
  return node.type === "Identifier" ? node.name : node.value;
}

export const noRafQueryWaterfall = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `useWaterfall` from `@raf-query/react`; start queries in the route loader instead",
    },
    schema: [],
    messages: {
      banned:
        "Do not use `useWaterfall` from `@raf-query/react`: it starts the query during render (a request waterfall). `ensure` / `prefetch` it in the route loader and read the handle with `useQuery`.",
    },
  },
  create(context) {
    const bannedLocals = new Set();
    const namespaceLocals = new Set();

    return {
      ImportSpecifier(node) {
        if (node.parent?.type !== "ImportDeclaration" || node.parent.source.value !== SOURCE) {
          return;
        }
        if (moduleExportName(node.imported) !== NAME) {
          return;
        }
        bannedLocals.add(node.local.name);
        context.report({ node, messageId: "banned" });
      },
      ImportNamespaceSpecifier(node) {
        if (node.parent?.type === "ImportDeclaration" && node.parent.source.value === SOURCE) {
          namespaceLocals.add(node.local.name);
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source?.value !== SOURCE) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ExportSpecifier" && moduleExportName(specifier.local) === NAME) {
            context.report({ node: specifier, messageId: "banned" });
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && bannedLocals.has(callee.name)) {
          context.report({ node, messageId: "banned" });
          return;
        }
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          namespaceLocals.has(callee.object.name) &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === NAME
        ) {
          context.report({ node, messageId: "banned" });
        }
      },
    };
  },
});
