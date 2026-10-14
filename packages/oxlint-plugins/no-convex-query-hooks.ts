import { defineRule } from "@oxlint/plugins";

const CONVEX_BANNED_HOOKS = new Set(["useQuery", "usePaginatedQuery", "useQueries"]);

function specifierImportedName(node) {
  return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function importSource(node) {
  const parent = node.parent;
  if (parent?.type !== "ImportDeclaration") {
    return null;
  }
  return parent.source.value;
}

export const noConvexQueryHooks = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Convex react query hooks; use raf-query with `@workspace/convex-query` factories instead",
    },
    schema: [],
    messages: {
      banned:
        "Do not use `{{name}}` from `convex/react`. `ensure` a `convexQuery` / `convexPaginatedQuery` factory in the route loader and read it with `useQuery` from `@raf-query/react`.",
    },
  },
  create(context) {
    /** @type {Map<string, string>} local name → imported name */
    const convexHookLocals = new Map();

    return {
      ImportSpecifier(node) {
        const imported = specifierImportedName(node);
        if (!CONVEX_BANNED_HOOKS.has(imported) || importSource(node) !== "convex/react") {
          return;
        }
        convexHookLocals.set(node.local.name, imported);
        context.report({
          node,
          messageId: "banned",
          data: { name: imported },
        });
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier") {
          return;
        }
        const imported = convexHookLocals.get(node.callee.name);
        if (!imported) {
          return;
        }
        context.report({
          node,
          messageId: "banned",
          data: { name: imported },
        });
      },
    };
  },
});
