---
name: typescript-best-practices
description: TypeScript best practices. Use when reading or editing any .ts or .tsx file.
---

# TypeScript best practices

Source: [backnotprop/pstack `skills/typescript-best-practices`](https://github.com/backnotprop/pstack/tree/main/skills/typescript-best-practices).

Apply the **type-system-discipline** principle skill first; this skill grounds it in TypeScript syntax.

| Rule | Summary |
|------|---------|
| Discriminated unions | Model variants with a `kind` literal discriminant so impossible states can't be represented. No optional-field bags. |
| Branded types | Brand primitives with `& { readonly __brand: "X" }` so they can't be mixed up. Validate once at creation. |
| Constructive modeling | Build the shape so the illegal value can't be constructed. `[T, ...T[]]` for non-empty, `[T, T][]` for even length, `start` plus `duration` for a range. Not a runtime guard, not a wish for refinement types. |
| Simplest total type | Keep `T[]` while every operation on it stays total. Strengthen to `NonEmpty<T>` only where the loose type forces `!`, a cast, or a "should never happen" throw. |
| `unknown` over `any` | External data is `unknown`. `any` disables type checking everywhere it touches. |
| No `as` casts | Every `as` is a runtime crash waiting. Cast only after validation. |
| Narrowing hierarchy | Discriminant switch > `in` operator > `typeof`/`instanceof` > user-defined type guard > `as`. |
| Type guards | Must verify the claim. A lying guard is worse than `as` because the bug hides behind a name that says it's safe. Name them `isX` or `hasX`. |
| Exhaustiveness | Inline `const _exhaustive: never = x;` in default arms so the compiler errors when a new variant is added. |
| `satisfies` over `as` | Validates the value without widening literal types. |
| Boundary validation | Validate where data crosses in; trust types inside. See the **boundary-discipline** principle skill. |
| Schema-derived types | Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface. |
| Object args | Pass objects, not positional, so argument order is self-documenting. Skip on hot paths (per-frame render, tokenizers, parsers). |
| Real tests | Don't mock what you can run. Prefer the framework's real test primitives with leak/disposable checks, and verify UI in a running build. Mock only what you can't run locally. |
| Structured telemetry | Prefer structured logger diagnostics with enough context to debug from an id. No `console.log` in shipped code. |

Examples: `references/patterns.md`.

## This repository

Keep the table above, then apply these local constraints so the skill does not fight lint:

- **Discriminants.** Use one name per domain and stick to it. Existing code uses `type` on `BabyStatus` and `kind` on notification capability. Do not mix both on the same union.
- **No optional `?` in `projects/isbabyoutyet/web`.** `workspace/no-optional` requires a present key with `T | null` / `T | undefined`. Do not reintroduce `Partial<{ ... }>` bags to dodge that rule when the caller already has the fields.
- **Assertions.** `typescript/consistent-type-assertions` is `never`. Earned casts need a `SAFETY:` comment (`anti-slop/require-safety-comment-for-type-assertion`). Prefer `satisfies` and `as const`. Tests may assert.
- **`unknown` vs `any`.** `anti-slop/no-unknown-parameters` (and `no-unknown-returns`) ban unparsed `unknown` on ordinary functions. Decode at the I/O boundary (`packages/runtime/src/guards.ts` is the seam). Never substitute `any` for that ban — give the value a domain type (`QueryFactoryInput`, `Doc<"baby">`, a discriminated union). Implementation-overload `any` on bivariant generic helpers (query-prefetch `invokeFactory`) is the remaining named exception: replacing it needs a banned `as` or a banned `unknown` parameter.
- **Branding.** Unique-symbol brands (query-prefetch handles) are valid here; do not rewrite them to `{ readonly __brand: "X" }`.
- **Exhaustiveness.** Default arms use `const _exhaustive: never = x;` (`_exhaustive` is allowlisted). `@typescript-eslint/switch-exhaustiveness-check` is the documented intent; oxlint does not ship that rule, so the `never` assignment is the check.
- **Object args.** `eslint/max-params: 2` plus "never destructure in function parameters". Named options objects, accessed with `opts.field`.
- **Schema-derived types.** Prefer `Doc<"table">`, `FunctionReturnType<typeof api.*>`, and Convex validators over parallel hand-written shapes.
- **Tests.** `workspace/no-mock` — no `vi.mock`. Use convex-test, real routers, and presentational `*View` seams.
- **Telemetry.** `no-console` in packages. Convex function `console.log` is the backend log stream; do not add new ones in first-party web/package code.
