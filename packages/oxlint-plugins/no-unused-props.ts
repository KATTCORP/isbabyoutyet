import { defineRule } from "@oxlint/plugins";

/**
 * Report props a React function component declares but never reads.
 *
 * A component is a PascalCase function (declaration, arrow, or expression,
 * optionally wrapped in `memo` / `forwardRef`) whose body renders JSX and whose
 * first parameter is a typed identifier: `function Card(props: CardProps)`.
 *
 * Declared keys come from the parameter's type, resolved statically in the
 * same file: inline type literals, local `type` aliases and `interface`s
 * (including `extends` of local interfaces), and intersections. Members that
 * cannot be resolved (imports, generics, utility types, unions) contribute no
 * keys, and a type with no resolvable member is skipped.
 *
 * A key counts as used when it is read as `props.key` / `props["key"]` or
 * destructured from `props`. Any other use of `props` (spreading it, passing
 * it to a child, hook, or function, aliasing it, computed access, rest
 * destructuring) may read anything, so it counts as using every key.
 */

const COMPONENT_NAME = /^[A-Z]/;
const WRAPPER_NAMES = new Set(["forwardRef", "memo"]);

function isFunction(node) {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression"
  );
}

function isWrapperCall(node) {
  if (node?.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return WRAPPER_NAMES.has(callee.name);
  }
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    WRAPPER_NAMES.has(callee.property.name)
  );
}

function componentName(fn) {
  if (fn.id?.type === "Identifier") {
    return fn.id.name;
  }
  let current = fn;
  while (isWrapperCall(current.parent) && current.parent.arguments[0] === current) {
    current = current.parent;
  }
  const parent = current.parent;
  if (parent?.type === "VariableDeclarator" && parent.init === current) {
    return parent.id.type === "Identifier" ? parent.id.name : null;
  }
  return null;
}

function keyName(key, computed) {
  if (!computed && key.type === "Identifier") {
    return key.name;
  }
  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

function unwrapDeclaration(statement) {
  if (
    (statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportDefaultDeclaration") &&
    statement.declaration
  ) {
    return statement.declaration;
  }
  return statement;
}

/** Module-level `type` / `interface` declarations by name; merged or duplicate names are dropped. */
function collectTypeDeclarations(program) {
  const declarations = new Map();
  const duplicates = new Set();
  for (const statement of program.body) {
    const declaration = unwrapDeclaration(statement);
    if (
      declaration.type !== "TSTypeAliasDeclaration" &&
      declaration.type !== "TSInterfaceDeclaration"
    ) {
      continue;
    }
    const name = declaration.id.name;
    if (declarations.has(name)) {
      duplicates.add(name);
    }
    declarations.set(name, declaration);
  }
  for (const name of duplicates) {
    declarations.delete(name);
  }
  return declarations;
}

function createTypeResolver(declarations) {
  function addMembers(members, keys) {
    for (const member of members) {
      if (member.type !== "TSPropertySignature" && member.type !== "TSMethodSignature") {
        continue;
      }
      const name = keyName(member.key, member.computed);
      if (name !== null) {
        keys.add(name);
      }
    }
  }

  function resolveReference(opts) {
    const declaration = declarations.get(opts.name);
    if (
      !declaration ||
      declaration.typeParameters ||
      opts.typeArguments ||
      opts.state.shadowed.has(opts.name) ||
      opts.state.visiting.has(opts.name)
    ) {
      return;
    }
    opts.state.visiting.add(opts.name);
    if (declaration.type === "TSTypeAliasDeclaration") {
      resolve(declaration.typeAnnotation, opts.state);
    } else {
      addMembers(declaration.body.body, opts.state.keys);
      for (const heritage of declaration.extends ?? []) {
        if (heritage.expression.type === "Identifier") {
          resolveReference({
            name: heritage.expression.name,
            state: opts.state,
            typeArguments: heritage.typeArguments,
          });
        }
      }
    }
    opts.state.visiting.delete(opts.name);
  }

  function resolve(typeNode, state) {
    switch (typeNode.type) {
      case "TSTypeLiteral": {
        addMembers(typeNode.members, state.keys);
        return;
      }
      case "TSIntersectionType": {
        for (const member of typeNode.types) {
          resolve(member, state);
        }
        return;
      }
      case "TSParenthesizedType": {
        resolve(typeNode.typeAnnotation, state);
        return;
      }
      case "TSTypeReference": {
        if (typeNode.typeName.type === "Identifier") {
          resolveReference({
            name: typeNode.typeName.name,
            state,
            typeArguments: typeNode.typeArguments,
          });
        }
        return;
      }
      default:
    }
  }

  return function declaredKeys(fn, typeNode) {
    const shadowed = new Set((fn.typeParameters?.params ?? []).map((param) => param.name.name));
    const state = { keys: new Set<string>(), shadowed, visiting: new Set() };
    resolve(typeNode, state);
    return state.keys;
  };
}

/** Keys read through one reference to `props`, or `null` when it may read any key. */
function keysReadByReference(identifier) {
  const parent = identifier.parent;
  if (parent?.type === "MemberExpression" && parent.object === identifier) {
    return [keyName(parent.property, parent.computed)];
  }
  if (parent?.type === "JSXMemberExpression" && parent.object === identifier) {
    return [parent.property.name];
  }
  if (
    parent?.type === "VariableDeclarator" &&
    parent.init === identifier &&
    parent.id.type === "ObjectPattern"
  ) {
    return parent.id.properties.map((property) =>
      property.type === "Property" ? keyName(property.key, property.computed) : null,
    );
  }
  return null;
}

/** Keys of `props` read anywhere in the component, or `null` when `props` escapes. */
function readKeys(variable) {
  const keys = new Set();
  for (const reference of variable.references) {
    if (!reference.isRead()) {
      continue;
    }
    const referenceKeys = keysReadByReference(reference.identifier);
    if (referenceKeys === null || referenceKeys.includes(null)) {
      return null;
    }
    for (const key of referenceKeys) {
      keys.add(key);
    }
  }
  return keys;
}

const noUnusedProps = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow React component props that are declared but never used",
    },
    schema: [],
    messages: {
      unused:
        "`{{component}}` declares prop `{{prop}}` but never reads or forwards it. Remove it from the props type and its callers.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const functionsWithJsx = new Set();
    let declaredKeys = createTypeResolver(new Map());

    function markJsx(node) {
      let current = node.parent;
      while (current) {
        if (isFunction(current)) {
          if (functionsWithJsx.has(current)) {
            return;
          }
          functionsWithJsx.add(current);
        }
        current = current.parent;
      }
    }

    function checkFunction(fn) {
      if (!functionsWithJsx.has(fn) || fn.params.length === 0) {
        return;
      }
      const param = fn.params[0];
      if (param.type !== "Identifier" || !param.typeAnnotation || param.name.startsWith("_")) {
        return;
      }
      const name = componentName(fn);
      if (name === null || !COMPONENT_NAME.test(name)) {
        return;
      }
      const keys = declaredKeys(fn, param.typeAnnotation.typeAnnotation);
      if (keys.size === 0) {
        return;
      }
      const variable = sourceCode
        .getDeclaredVariables(fn)
        .find((candidate) => candidate.name === param.name);
      if (!variable) {
        return;
      }
      const used = readKeys(variable);
      if (used === null) {
        return;
      }
      for (const key of keys) {
        if (!used.has(key)) {
          context.report({
            node: param,
            messageId: "unused",
            data: { component: name, prop: key },
          });
        }
      }
    }

    return {
      Program(node) {
        declaredKeys = createTypeResolver(collectTypeDeclarations(node));
      },
      JSXElement: markJsx,
      JSXFragment: markJsx,
      "FunctionDeclaration:exit": checkFunction,
      "FunctionExpression:exit": checkFunction,
      "ArrowFunctionExpression:exit": checkFunction,
    };
  },
});

export { noUnusedProps };
