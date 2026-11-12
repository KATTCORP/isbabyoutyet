import { defineRule } from "@oxlint/plugins";

/**
 * Require a type on an object literal that nothing else types: one bound to
 * a variable, or returned from a function declared on its own.
 *
 * A loose object says nothing about what it is for, and a typo in a key
 * compiles. Name the type it fills in:
 *
 * - `const input: TimelineInput = { … }`
 * - `const input = { … } satisfies TimelineInput` (or `as const satisfies`)
 * - `function timelineInput(): TimelineInput { return { … }; }`
 *
 * A literal passed straight to a call, or returned from a callback, is typed
 * by the parameter it is passed to, so it is fine.
 */

const MESSAGE =
  "Give this object its type: annotate the variable (`const name: Type = { … }`) or the function's return type, or add `satisfies Type`.";

/** `node` without the parentheses and `as const` around it. */
function unwrap(node) {
  let current = node;
  while (
    current?.type === "ParenthesizedExpression" ||
    (current?.type === "TSAsExpression" &&
      current.typeAnnotation.type === "TSTypeReference" &&
      current.typeAnnotation.typeName.type === "Identifier" &&
      current.typeAnnotation.typeName.name === "const")
  ) {
    current = current.expression;
  }
  return current;
}

function isObjectLiteral(node) {
  return unwrap(node)?.type === "ObjectExpression";
}

/**
 * Whether nothing types what `fn` returns: it has no return type, and it is
 * a declaration or bound to a variable without a type, not a callback an
 * argument's or a property's type would type.
 */
function returnsUntyped(fn) {
  if (fn.returnType) {
    return false;
  }
  if (fn.type === "FunctionDeclaration") {
    return true;
  }
  const parent = fn.parent;
  return parent?.type === "VariableDeclarator" && parent.init === fn && !parent.id.typeAnnotation;
}

export const noUntypedObjectLiteral = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a type annotation or `satisfies` on object literals bound to a variable or returned from a standalone function",
    },
    schema: [],
    messages: {
      untyped: MESSAGE,
    },
  },

  create(context) {
    /** Per enclosing function, innermost last: whether nothing types its returns. */
    const untypedReturns: Array<boolean> = [];

    const enter = (fn) => {
      const untyped = returnsUntyped(fn);
      untypedReturns.push(untyped);
      if (untyped && fn.type === "ArrowFunctionExpression" && isObjectLiteral(fn.body)) {
        context.report({ node: fn.body, messageId: "untyped" });
      }
    };
    const exit = () => {
      untypedReturns.pop();
    };

    return {
      ArrowFunctionExpression: enter,
      "ArrowFunctionExpression:exit": exit,
      FunctionDeclaration: enter,
      "FunctionDeclaration:exit": exit,
      FunctionExpression: enter,
      "FunctionExpression:exit": exit,

      ReturnStatement(node) {
        if (node.argument && untypedReturns.at(-1) && isObjectLiteral(node.argument)) {
          context.report({ node: node.argument, messageId: "untyped" });
        }
      },

      VariableDeclarator(node) {
        if (node.init && !node.id.typeAnnotation && isObjectLiteral(node.init)) {
          context.report({ node: node.init, messageId: "untyped" });
        }
      },
    };
  },
});
