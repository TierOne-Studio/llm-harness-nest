# Generics

**Purpose:** Create reusable, type-flexible components while maintaining type safety.

**Basic Generic Function:**

```typescript
function identity<T>(value: T): T {
  return value;
}

const num = identity<number>(42); // Type: number
const str = identity<string>("hello"); // Type: string
const auto = identity(true); // Type inferred: boolean
```

**Generic Constraints:**

```typescript
interface HasLength {
  length: number;
}

function logLength<T extends HasLength>(item: T): T {
  console.log(item.length);
  return item;
}

logLength("hello"); // OK: string has length
logLength([1, 2, 3]); // OK: array has length
logLength({ length: 10 }); // OK: object has length
// logLength(42);             // Error: number has no length
```

**Multiple Type Parameters:**

```typescript
function merge<T, U>(obj1: T, obj2: U): T & U {
  return { ...obj1, ...obj2 };
}

const merged = merge({ name: "John" }, { age: 30 });
// Type: { name: string } & { age: number }
```
