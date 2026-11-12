import { defineRule } from "@oxlint/plugins";

/**
 * Ban a TanStack Router `beforeLoad` the router waits for.
 *
 * `beforeLoad` runs before any loader, parent to child, one after the other:
 * every await in one holds back every loader under it, so a route tree with
 * guards that wait in `beforeLoad` is a request waterfall. Loaders start
 * together.
 *
 * A synchronous `beforeLoad` holds nothing back, and is fine: a redirect the
 * URL alone decides, or route context computed on the spot. It is written
 * inline, not `async`, and returns an object literal or nothing, so this
 * rule can see the router gets no promise from it.
 *
 * A guard that reads data goes in the route's `loader`, which throws
 * `redirect()` or `notFound()`. The router lets either win over what the
 * loaders beside it find, so those must answer `null` / `FORBIDDEN` or fail
 * for a visitor the guard turns away. What an awaited `beforeLoad` put in
 * route context for its children (the profile, a flag) each child loads
 * itself: the same query in two loaders is one request.
 */

/** Wrappers that don't change what an expression evaluates to. */
const TRANSPARENT_WRAPPERS = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

function keyName(node) {
  if (node.computed) {
    return node.key.type === "Literal" ? node.key.value : null;
  }
  return node.key.type === "Identifier" ? node.key.name : node.key.value;
}

function isFunction(node) {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  );
}

/** Whether a returned expression could be a promise: the result of a call, on any branch. */
function mayBePromise(node) {
  if (TRANSPARENT_WRAPPERS.has(node.type)) {
    return mayBePromise(node.expression);
  }
  switch (node.type) {
    case "AwaitExpression":
    case "CallExpression":
    case "ImportExpression":
    case "NewExpression": {
      return true;
    }
    case "ChainExpression": {
      return mayBePromise(node.expression);
    }
    case "ConditionalExpression": {
      return mayBePromise(node.consequent) || mayBePromise(node.alternate);
    }
    case "LogicalExpression": {
      return mayBePromise(node.left) || mayBePromise(node.right);
    }
    case "SequenceExpression": {
      return mayBePromise(node.expressions.at(-1));
    }
    default: {
      return false;
    }
  }
}

/**
 * Collects the `return` arguments of a function body into `found`, leaving
 * out those of functions inside it.
 */
function collectReturned(node, found) {
  if (!node || typeof node.type !== "string" || isFunction(node)) {
    return;
  }
  if (node.type === "ReturnStatement") {
    if (node.argument) {
      found.push(node.argument);
    }
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "parent") {
      continue;
    }
    for (const item of Array.isArray(child) ? child : [child]) {
      if (item && typeof item === "object") {
        collectReturned(item, found);
      }
    }
  }
}

/** What an inline function hands back: its concise body, or each `return`'s argument. */
function returnedExpressions(fn) {
  if (!fn.body) {
    return [];
  }
  if (fn.body.type !== "BlockStatement") {
    return [fn.body];
  }
  /** @type {Array<import("@oxlint/plugins").ESTree.Expression>} */
  const found = [];
  collectReturned(fn.body, found);
  return found;
}

export const noAsyncBeforeLoad = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a `beforeLoad` the router waits for; guard in the `loader`, which runs beside the other loaders",
    },
    schema: [],
    messages: {
      async:
        "Do not make `beforeLoad` async: the router waits for it before every loader under it, one route after the other (a request waterfall). Throw `redirect()` / `notFound()` from the route's `loader`, and load what child routes need in their own loaders. A synchronous `beforeLoad` is fine.",
      notInline:
        "Write `beforeLoad` as an inline function, so this rule can see that it is synchronous.",
      returnsCall:
        "`beforeLoad` returns the result of a call, which may be a promise the router waits for before every loader under it. Return an object literal or nothing, or move this to the route's `loader`.",
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.parent.type !== "ObjectExpression" || keyName(node) !== "beforeLoad") {
          return;
        }
        const value = node.value;
        if (value.type !== "ArrowFunctionExpression" && value.type !== "FunctionExpression") {
          context.report({ node: node.key, messageId: "notInline" });
          return;
        }
        if (value.async) {
          context.report({ node: node.key, messageId: "async" });
          return;
        }
        for (const expression of returnedExpressions(value)) {
          if (mayBePromise(expression)) {
            context.report({ node: expression, messageId: "returnsCall" });
          }
        }
      },
    };
  },
});
