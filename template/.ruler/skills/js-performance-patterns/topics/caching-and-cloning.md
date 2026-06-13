# Caching and Cloning

Avoiding recomputation through memoization, and copying data correctly with `structuredClone`.

---

## 4. Memoize Expensive Function Results

**Impact: MEDIUM-HIGH** — Avoids recomputing the same result.

When a pure function is called repeatedly with the same arguments, cache the result.

**Simple single-value cache:**

```typescript
function memoize<T extends (...args: any[]) => any>(fn: T): T {
  let lastArgs: any[] | undefined
  let lastResult: any

  return ((...args: any[]) => {
    if (lastArgs && args.every((arg, i) => Object.is(arg, lastArgs![i]))) {
      return lastResult
    }
    lastArgs = args
    lastResult = fn(...args)
    return lastResult
  }) as T
}

const expensiveCalc = memoize((data: number[]) => {
  return data.reduce((sum, n) => sum + heavyTransform(n), 0)
})
```

**Multi-key cache with Map:**

```typescript
const cache = new Map<string, Result>()

function getResult(key: string): Result {
  if (cache.has(key)) return cache.get(key)!
  const result = computeExpensiveResult(key)
  cache.set(key, result)
  return result
}
```

For caches that can grow unbounded, use an LRU strategy or `WeakMap` for object keys.

---

## 11. Use `structuredClone` for Deep Copies

**Impact: LOW** — Correct deep cloning without libraries.

`structuredClone()` handles circular references, typed arrays, Dates, RegExps, Maps, and Sets — unlike `JSON.parse(JSON.stringify())`.

```typescript
// Avoid — loses Dates, Maps, Sets, undefined values
const copy = JSON.parse(JSON.stringify(original))

// Prefer — handles all standard types
const copy = structuredClone(original)
```

Note: `structuredClone` cannot clone functions or DOM nodes. For those cases, implement a custom clone.
