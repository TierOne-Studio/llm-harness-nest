---
name: typescript-advanced-types
description: Master TypeScript's advanced type system including generics, conditional types, mapped types, template literals, and utility types for building type-safe applications. Use when implementing complex type logic, creating reusable type utilities, or ensuring compile-time type safety in TypeScript projects.
harness:
  tier: shared
  family: language
  gist: "Generics, conditional/mapped/template-literal types (index + topics)"
---

# TypeScript Advanced Types

Index skill for TypeScript's advanced type system: generics, conditional types, mapped types, template literal types, utility types, narrowing, and applied patterns. Each theme has its own file in [topics/](topics/) with full explanations and illustrative examples.

Read this SKILL.md to identify which topic applies; then read the specific topic file for the depth.

## When to Use This Skill

- Building type-safe libraries or frameworks
- Creating reusable generic components
- Implementing complex type inference logic
- Designing type-safe API clients
- Building form validation systems
- Creating strongly-typed configuration objects
- Implementing type-safe state management
- Migrating JavaScript codebases to TypeScript

## Topics (index)

| Situation | Depth |
|---|---|
| Generic functions/classes, constraints (`T extends ...`), multiple type parameters | [topics/generics.md](topics/generics.md) |
| Conditional types (`T extends U ? X : Y`, distributivity), mapped types (key remapping, property filtering), template literal types (string manipulation, path building) | [topics/conditional-mapped-template-types.md](topics/conditional-mapped-template-types.md) |
| Built-in utility types (`Partial`, `Pick`, `Omit`, `Record`, ...), the `infer` keyword, type testing (`AssertEqual`) | [topics/utility-types-and-inference.md](topics/utility-types-and-inference.md) |
| Discriminated unions, type-safe state machines/reducers, type guards, assertion functions | [topics/discriminated-unions-narrowing.md](topics/discriminated-unions-narrowing.md) |
| Applied end-to-end patterns: typed event emitter, type-safe API client, builder with completeness checking, `DeepReadonly`/`DeepPartial`, form validation | [topics/advanced-patterns.md](topics/advanced-patterns.md) |

## Best Practices

1. **Use `unknown` over `any`**: Enforce type checking
2. **Prefer `interface` for object shapes**: Better error messages
3. **Use `type` for unions and complex types**: More flexible
4. **Leverage type inference**: Let TypeScript infer when possible
5. **Create helper types**: Build reusable type utilities
6. **Use const assertions**: Preserve literal types
7. **Avoid type assertions**: Use type guards instead
8. **Document complex types**: Add JSDoc comments
9. **Use strict mode**: Enable all strict compiler options
10. **Test your types**: Use type tests to verify type behavior

## Common Pitfalls

1. **Over-using `any`**: Defeats the purpose of TypeScript
2. **Ignoring strict null checks**: Can lead to runtime errors
3. **Too complex types**: Can slow down compilation
4. **Not using discriminated unions**: Misses type narrowing opportunities
5. **Forgetting readonly modifiers**: Allows unintended mutations
6. **Circular type references**: Can cause compiler errors
7. **Not handling edge cases**: Like empty arrays or null values

## Performance Considerations

- Avoid deeply nested conditional types
- Use simple types when possible
- Cache complex type computations
- Limit recursion depth in recursive types
- Use build tools to skip type checking in production
