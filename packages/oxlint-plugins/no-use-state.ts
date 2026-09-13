import { defineRule } from "@oxlint/plugins";

/**
 * Disallow React local-state / subscription hooks outside audited seams
 * (vendored UI + app lib).
 *
 * Feature UI state should live in the URL (search params / nested routes),
 * come from queries/mutations, or use uncontrolled component triggers
 * (PopoverTrigger, DialogTrigger, etc.). Ephemeral timing, observers, and
 * external-store subscriptions belong in `projects/baby-outlet/web/src/lib`.
 *
 * Also bans useReducer / useActionState / useOptimistic — they are useState
 * with extra steps and would otherwise bypass the rule. Optimistic UI that
 * must clear when server data catches up uses `useOptimisticOverride` in lib
 * (render-time adjustment), not React's `useOptimistic`.
 *
 * `useSyncExternalStore` is banned in feature code for the same reason:
 * subscriptions must live in named lib seams, not ad-hoc in routes/components.
 */

const BANNED_STATE_HOOKS = new Set([
  "useState",
  "useReducer",
  "useActionState",
  "useOptimistic",
  "useSyncExternalStore",
]);
const MESSAGE =
  "Do not use React `{{name}}`. Put shareable UI state in the URL, derive it from queries/mutations, or use an uncontrolled component trigger; audited lib hooks may own local state and external-store subscriptions.";

function importedName(node) {
  return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function propertyName(node) {
  if (node.property.type === "Identifier" && !node.computed) {
    return node.property.name;
  }
  if (node.property.type === "Literal") {
    return node.property.value;
  }
  return null;
}

const noUseState = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React local-state hooks in feature application code",
    },
    schema: [],
    messages: {
      banned: MESSAGE,
    },
  },

  create(context) {
    const reactNamespaces = new Set();

    return {
      ImportSpecifier(node) {
        if (
          node.parent?.type === "ImportDeclaration" &&
          node.parent.source.value === "react" &&
          BANNED_STATE_HOOKS.has(importedName(node))
        ) {
          context.report({
            node,
            messageId: "banned",
            data: { name: importedName(node) },
          });
        }
      },

      ImportDefaultSpecifier(node) {
        if (node.parent?.type === "ImportDeclaration" && node.parent.source.value === "react") {
          reactNamespaces.add(node.local.name);
        }
      },

      ImportNamespaceSpecifier(node) {
        if (node.parent?.type === "ImportDeclaration" && node.parent.source.value === "react") {
          reactNamespaces.add(node.local.name);
        }
      },

      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          reactNamespaces.has(node.object.name) &&
          BANNED_STATE_HOOKS.has(propertyName(node))
        ) {
          context.report({
            node,
            messageId: "banned",
            data: { name: propertyName(node) },
          });
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type !== "ObjectPattern" ||
          node.init?.type !== "Identifier" ||
          !reactNamespaces.has(node.init.name)
        ) {
          return;
        }
        for (const property of node.id.properties) {
          if (
            property.type === "Property" &&
            !property.computed &&
            property.key.type === "Identifier" &&
            BANNED_STATE_HOOKS.has(property.key.name)
          ) {
            context.report({
              node: property,
              messageId: "banned",
              data: { name: property.key.name },
            });
          }
        }
      },

      ExportNamedDeclaration(node) {
        if (node.source?.value !== "react") {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ExportSpecifier") {
            const name =
              specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value;
            if (BANNED_STATE_HOOKS.has(name)) {
              context.report({
                node: specifier,
                messageId: "banned",
                data: { name },
              });
            }
          }
        }
      },
    };
  },
});

export { noUseState };
