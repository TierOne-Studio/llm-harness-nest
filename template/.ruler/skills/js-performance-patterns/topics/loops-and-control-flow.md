# Loops and Control Flow

Micro-optimizations for tight loops and frequently-called functions: caching property access, single-pass iteration, short-circuits, early returns, and hoisting constants.

---

## 3. Cache Property Access in Tight Loops

**Impact: MEDIUM** — Reduces repeated property resolution.

Accessing deeply nested properties or array `.length` in every iteration adds overhead in tight loops.

**Avoid:**

```typescript
for (let i = 0; i < data.items.length; i++) {
  process(data.items[i].value.nested.prop)
}
```

**Prefer:**

```typescript
const { items } = data
for (let i = 0, len = items.length; i < len; i++) {
  const val = items[i].value.nested.prop
  process(val)
}
```

This matters for arrays with 10,000+ items or when called at 60fps. For small arrays or infrequent calls, the readable version is fine.

---

## 5. Combine Iterations Over the Same Data

**Impact: MEDIUM** — Single pass instead of multiple.

Chaining `.filter().map().reduce()` creates intermediate arrays and iterates the data multiple times. For large arrays in hot paths, combine into a single loop.

**Avoid — 3 iterations, 2 intermediate arrays:**

```typescript
const result = users
  .filter(u => u.active)
  .map(u => u.name)
  .reduce((acc, name) => acc + name + ', ', '')
```

**Prefer — single pass:**

```typescript
let result = ''
for (const u of users) {
  if (u.active) {
    result += u.name + ', '
  }
}
```

For small arrays (< 100 items), the chained version is fine and more readable. Optimize only when profiling shows it matters.

---

## 6. Short-Circuit with Length Checks First

**Impact: LOW-MEDIUM** — Avoids expensive operations on empty inputs.

Before running expensive comparisons or transformations, check if the input is empty.

```typescript
function findMatchingItems(items: Item[], query: string): Item[] {
  if (items.length === 0 || query.length === 0) return []

  const normalized = query.toLowerCase()
  return items.filter(item =>
    item.name.toLowerCase().includes(normalized)
  )
}
```

---

## 7. Return Early to Skip Unnecessary Work

**Impact: LOW-MEDIUM** — Reduces average-case execution.

Structure functions to exit as soon as possible for common non-matching cases.

**Avoid — always does full work:**

```typescript
function processEvent(event: AppEvent) {
  let result = null
  if (event.type === 'click') {
    if (event.target && event.target.matches('.actionable')) {
      result = handleAction(event)
    }
  }
  return result
}
```

**Prefer — exits early:**

```typescript
function processEvent(event: AppEvent) {
  if (event.type !== 'click') return null
  if (!event.target?.matches('.actionable')) return null
  return handleAction(event)
}
```

---

## 8. Hoist RegExp and Constant Creation Outside Loops

**Impact: LOW-MEDIUM** — Avoids repeated compilation.

Creating RegExp objects or constant values inside loops or frequently-called functions wastes CPU.

**Avoid — compiles regex 10,000 times:**

```typescript
function validate(items: string[]) {
  return items.filter(item => {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return pattern.test(item)
  })
}
```

**Prefer — compile once:**

```typescript
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

function validate(items: string[]) {
  return items.filter(item => EMAIL_PATTERN.test(item))
}
```
