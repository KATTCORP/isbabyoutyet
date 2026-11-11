import { defineRule } from "@oxlint/plugins";

/**
 * Ban TanStack Router's `beforeLoad` route option.
 *
 * `beforeLoad` runs before any loader, parent to child, one after the other:
 * every await in one holds back every loader under it, so a route tree with
 * guards in `beforeLoad` is a request waterfall. Loaders start together.
 *
 * A guard goes in the route's `loader`, which throws `redirect()` or
 * `notFound()`. The router lets either win over what the loaders beside it
 * find, so those must answer `null` / `FORBIDDEN` or fail for a visitor the
 * guard turns away. What `beforeLoad` put in route context for its children
 * (the profile, a flag) each child loads itself: the same query in two
 * loaders is one request.
 */

function keyName(node) {
  if (node.computed) {
    return node.key.type === "Literal" ? node.key.value : null;
  }
  return node.key.type === "Identifier" ? node.key.name : node.key.value;
}

export const noBeforeLoad = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow the `beforeLoad` route option; guard in the `loader`, which runs beside the other loaders",
    },
    schema: [],
    messages: {
      banned:
        "Do not use `beforeLoad`: it runs before every loader under it, one route after the other (a request waterfall). Throw `redirect()` / `notFound()` from the route's `loader`, and load what child routes need in their own loaders.",
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.parent.type === "ObjectExpression" && keyName(node) === "beforeLoad") {
          context.report({ node: node.key, messageId: "banned" });
        }
      },
    };
  },
});
