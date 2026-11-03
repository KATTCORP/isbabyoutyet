import { defineRule } from "@oxlint/plugins";

/**
 * Report route loader data that nothing in the route file reads.
 *
 * Every key the loader returns must be read via `Route.useLoaderData()` or
 * `opts.loaderData` (`head`, `headers`, …). An unread raf-query handle means
 * the loader `ensure`s / `prefetch`es a query nobody renders.
 *
 * Loader data counts as fully read (no reports) when it escapes as a whole:
 * passed to a function or JSX prop, spread, returned, or read with a computed
 * key. Reads via `getRouteApi()` or bare `useLoaderData()` count for every
 * route in the file, since they can't be tied to one.
 */

const ROUTE_FACTORIES = new Set([
  "createFileRoute",
  "createRootRoute",
  "createRootRouteWithContext",
  "createRoute",
]);

const QUERY_START_METHODS = new Set(["ensure", "prefetch"]);

const TRANSPARENT_WRAPPERS = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const MAX_RESOLVE_DEPTH = 8;

function isFunction(node) {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression"
  );
}

function containingFunction(node) {
  let current = node.parent;
  while (current && !isFunction(current)) {
    current = current.parent;
  }
  return current;
}

function staticKey(node) {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function propertyKey(property) {
  return property.computed ? null : staticKey(property.key);
}

function memberKey(member) {
  if (!member.computed) {
    return member.property.type === "Identifier" ? member.property.name : null;
  }
  return member.property.type === "Literal" && typeof member.property.value === "string"
    ? member.property.value
    : null;
}

function calleeName(callee) {
  if (callee.type === "Identifier") {
    return callee.name;
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    return callee.property.type === "Identifier" ? callee.property.name : null;
  }
  return null;
}

function unwrap(node) {
  let current = node;
  while (current && (TRANSPARENT_WRAPPERS.has(current.type) || current.type === "AwaitExpression")) {
    current = current.type === "AwaitExpression" ? current.argument : current.expression;
  }
  return current;
}

/** `createFileRoute("/x")({ … })`, `createRoute({ … })`, `createRootRouteWithContext<T>()({ … })`. */
function isRouteOptions(node) {
  const call = node.parent;
  if (call?.type !== "CallExpression" || call.arguments[0] !== node) {
    return false;
  }
  const callee = call.callee.type === "CallExpression" ? call.callee.callee : call.callee;
  return callee.type === "Identifier" && ROUTE_FACTORIES.has(callee.name);
}

function routeVariableName(options) {
  const declarator = options.parent.parent;
  return declarator?.type === "VariableDeclarator" && declarator.id.type === "Identifier"
    ? declarator.id.name
    : null;
}

function isTestPosition(node) {
  const parent = node.parent;
  switch (parent?.type) {
    case "UnaryExpression":
      return parent.operator === "!" || parent.operator === "typeof";
    case "BinaryExpression":
      return true;
    case "IfStatement":
    case "ConditionalExpression":
    case "WhileStatement":
      return parent.test === node;
    case "LogicalExpression":
      return parent.left === node && parent.operator !== "??";
    default:
      return false;
  }
}

export const noUnusedLoaderData = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every key a route loader returns to be read in the route file; unread raf-query handles are wasted queries",
    },
    schema: [],
    messages: {
      unusedQuery:
        "The loader starts a query for `{{key}}`, but nothing in this file reads it. Read it with `useQuery(factory, loaderData.{{key}})` / pass it to a child, or remove the query from the loader.",
      unusedKey:
        "The loader returns `{{key}}`, but nothing in this file reads it from `Route.useLoaderData()` or `opts.loaderData`. Stop returning it.",
      unusedQueryValue:
        "The loader returns a query handle that nothing in this file reads. Read it with `useQuery(factory, Route.useLoaderData())`, or remove the query from the loader.",
      unusedValue:
        "The loader returns data that nothing in this file reads from `Route.useLoaderData()` or `opts.loaderData`. Stop returning it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    /** Route options object → `{ name, returns }`. */
    const routes = new Map();
    /** Loader function → its route options object. */
    const loaderFunctions = new Map();
    /** Loader-data expressions whose target route is resolved on `Program:exit`. */
    const reads = [];

    function findVariable(identifier) {
      let scope = sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
          return variable;
        }
        scope = scope.upper;
      }
      return null;
    }

    function bindingInit(identifier) {
      const definition = findVariable(identifier)?.defs[0];
      const declarator = definition?.node;
      return declarator?.type === "VariableDeclarator" &&
        declarator.id.type === "Identifier" &&
        declarator.init
        ? declarator.init
        : null;
    }

    function isQueryStart(node, depth) {
      const value = unwrap(node);
      if (!value || depth > MAX_RESOLVE_DEPTH) {
        return false;
      }
      if (value.type === "CallExpression") {
        return (
          value.callee.type === "MemberExpression" &&
          QUERY_START_METHODS.has(calleeName(value.callee))
        );
      }
      if (value.type === "Identifier") {
        const init = bindingInit(value);
        return init ? isQueryStart(init, depth + 1) : false;
      }
      return false;
    }

    /**
     * What a loader return expression evaluates to:
     * `object` (known keys), `value` (an opaque non-object), or `empty`.
     */
    function resolveReturn(node, depth) {
      const value = unwrap(node);
      if (
        !value ||
        (value.type === "Identifier" && value.name === "undefined") ||
        (value.type === "Literal" && value.value === null) ||
        (value.type === "UnaryExpression" && value.operator === "void")
      ) {
        return { kind: "empty" };
      }
      if (depth > MAX_RESOLVE_DEPTH) {
        return { kind: "value", node: value };
      }
      if (value.type === "ObjectExpression") {
        const entries = [];
        for (const property of value.properties) {
          if (property.type === "SpreadElement") {
            const spread = resolveReturn(property.argument, depth + 1);
            if (spread.kind === "object") {
              entries.push(...spread.entries);
            }
            continue;
          }
          const key = propertyKey(property);
          if (key !== null) {
            entries.push({ key, node: property, value: property.value });
          }
        }
        return { kind: "object", entries };
      }
      if (value.type === "CallExpression" && calleeName(value.callee) === "allKeyed") {
        return value.arguments[0]
          ? resolveReturn(value.arguments[0], depth + 1)
          : { kind: "value", node: value };
      }
      if (value.type === "Identifier") {
        const init = bindingInit(value);
        return init ? resolveReturn(init, depth + 1) : { kind: "value", node: value };
      }
      if (value.type === "ConditionalExpression" || value.type === "LogicalExpression") {
        const branches = [
          value.type === "ConditionalExpression" ? value.consequent : value.left,
          value.type === "ConditionalExpression" ? value.alternate : value.right,
        ].map((branch) => resolveReturn(branch, depth + 1));
        const opaque = branches.find((branch) => branch.kind === "value");
        if (opaque) {
          return opaque;
        }
        return {
          kind: "object",
          entries: branches.flatMap((branch) => (branch.kind === "object" ? branch.entries : [])),
        };
      }
      return { kind: "value", node: value };
    }

    function readIdentifierReferences(declaration, name, usage) {
      const variable = sourceCode
        .getDeclaredVariables(declaration)
        .find((candidate) => candidate.name === name);
      if (!variable) {
        usage.whole = true;
        return;
      }
      for (const reference of variable.references) {
        if (reference.isRead()) {
          collectUsage(reference.identifier, usage);
        }
      }
    }

    function collectPatternUsage(pattern, usage) {
      if (pattern.type === "Identifier") {
        return false;
      }
      if (pattern.type !== "ObjectPattern") {
        usage.whole = true;
        return true;
      }
      for (const property of pattern.properties) {
        const key = property.type === "Property" ? propertyKey(property) : null;
        if (key === null) {
          usage.whole = true;
        } else {
          usage.keys.add(key);
        }
      }
      return true;
    }

    /** Record how a loader-data expression is consumed. */
    function collectUsage(node, usage) {
      let current = node;
      while (current.parent && TRANSPARENT_WRAPPERS.has(current.parent.type)) {
        current = current.parent;
      }
      const parent = current.parent;

      if (parent?.type === "MemberExpression" && parent.object === current) {
        const key = memberKey(parent);
        if (key === null) {
          usage.whole = true;
        } else {
          usage.keys.add(key);
        }
        return;
      }
      if (parent?.type === "VariableDeclarator" && parent.init === current) {
        if (!collectPatternUsage(parent.id, usage)) {
          readIdentifierReferences(parent, parent.id.name, usage);
        }
        return;
      }
      if (isTestPosition(current)) {
        return;
      }
      usage.whole = true;
    }

    /** `Route.useLoaderData({ select: (data) => data.key })` */
    function collectSelectUsage(call, usage) {
      const options = call.arguments[0];
      if (!options) {
        return false;
      }
      const select =
        options.type === "ObjectExpression"
          ? options.properties.find(
              (property) => property.type === "Property" && propertyKey(property) === "select",
            )
          : null;
      if (!select) {
        return false;
      }
      const fn = select.value;
      const param = isFunction(fn) ? fn.params[0] : null;
      if (!param) {
        usage.whole = true;
        return true;
      }
      if (!collectPatternUsage(param, usage)) {
        readIdentifierReferences(fn, param.name, usage);
      }
      return true;
    }

    function enclosingRouteOptions(node) {
      let current = node.parent;
      while (current) {
        if (routes.has(current)) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function targetRoutes(read) {
      const named = [...routes].filter((entry) => entry[1].name === read.routeName);
      if (read.routeName !== null && named.length > 0) {
        return named.map((entry) => entry[0]);
      }
      const enclosing = enclosingRouteOptions(read.node);
      return enclosing ? [enclosing] : [...routes.keys()];
    }

    function report(route, usage) {
      for (const returned of route.returns) {
        const resolved = resolveReturn(returned, 0);
        if (resolved.kind === "empty" || usage.whole) {
          continue;
        }
        if (resolved.kind === "value") {
          if (usage.keys.size === 0) {
            context.report({
              node: resolved.node,
              messageId: isQueryStart(resolved.node, 0) ? "unusedQueryValue" : "unusedValue",
            });
          }
          continue;
        }
        for (const entry of resolved.entries) {
          if (!usage.keys.has(entry.key)) {
            context.report({
              node: entry.node,
              messageId: isQueryStart(entry.value, 0) ? "unusedQuery" : "unusedKey",
              data: { key: entry.key },
            });
          }
        }
      }
    }

    return {
      Property(node) {
        if (
          propertyKey(node) !== "loader" ||
          !isFunction(node.value) ||
          node.parent?.type !== "ObjectExpression" ||
          !isRouteOptions(node.parent)
        ) {
          return;
        }
        const options = node.parent;
        routes.set(options, { name: routeVariableName(options), returns: [] });
        loaderFunctions.set(node.value, options);
        if (node.value.body.type !== "BlockStatement") {
          routes.get(options).returns.push(node.value.body);
        }
      },

      ReturnStatement(node) {
        const options = loaderFunctions.get(containingFunction(node));
        if (options && node.argument) {
          routes.get(options).returns.push(node.argument);
        }
      },

      CallExpression(node) {
        if (calleeName(node.callee) !== "useLoaderData") {
          return;
        }
        const object = node.callee.type === "MemberExpression" ? node.callee.object : null;
        reads.push({
          kind: "call",
          node,
          routeName: object?.type === "Identifier" ? object.name : null,
        });
      },

      MemberExpression(node) {
        if (memberKey(node) === "loaderData") {
          reads.push({ kind: "expression", node, routeName: null });
        }
      },

      ObjectPattern(node) {
        if (!isFunction(node.parent) || !node.parent.params.includes(node)) {
          return;
        }
        for (const property of node.properties) {
          if (property.type === "Property" && propertyKey(property) === "loaderData") {
            reads.push({ kind: "pattern", node: property, routeName: null });
          }
        }
      },

      "Program:exit"() {
        if (routes.size === 0) {
          return;
        }
        const usages = new Map();
        for (const options of routes.keys()) {
          usages.set(options, { keys: new Set(), whole: false });
        }

        for (const read of reads) {
          const usage = { keys: new Set(), whole: false };
          if (read.kind === "pattern") {
            if (!collectPatternUsage(read.node.value, usage)) {
              readIdentifierReferences(read.node.parent.parent, read.node.value.name, usage);
            }
          } else if (read.kind === "expression" || !collectSelectUsage(read.node, usage)) {
            collectUsage(read.node, usage);
          }
          for (const options of targetRoutes(read)) {
            const target = usages.get(options);
            target.whole ||= usage.whole;
            for (const key of usage.keys) {
              target.keys.add(key);
            }
          }
        }

        for (const [options, route] of routes) {
          report(route, usages.get(options));
        }
      },
    };
  },
});
