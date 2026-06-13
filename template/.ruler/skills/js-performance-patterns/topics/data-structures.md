# Data Structure Choices

Picking the right collection type for lookups, dynamic keys, and immutable array operations.

---

## 1. Use `Set` and `Map` for Lookups

**Impact: HIGH for large collections** — O(1) vs O(n) per lookup.

Array methods like `.includes()`, `.find()`, and `.indexOf()` scan linearly. For repeated lookups against the same collection, convert to `Set` or `Map` first.

**Avoid — O(n) per check:**

```typescript
const allowedIds = ['a', 'b', 'c', /* ...hundreds more */]

function isAllowed(id: string) {
  return allowedIds.includes(id) // scans entire array
}

items.filter(item => allowedIds.includes(item.id)) // O(n * m)
```

**Prefer — O(1) per check:**

```typescript
const allowedIds = new Set(['a', 'b', 'c', /* ...hundreds more */])

function isAllowed(id: string) {
  return allowedIds.has(id)
}

items.filter(item => allowedIds.has(item.id)) // O(n)
```

For key-value lookups, use `Map` instead of scanning an array of objects:

```typescript
// Avoid
const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
const user = users.find(u => u.id === targetId) // O(n)

// Prefer
const userMap = new Map(users.map(u => [u.id, u]))
const user = userMap.get(targetId) // O(1)
```

---

## 12. Prefer `Map` Over Plain Objects for Dynamic Keys

**Impact: LOW-MEDIUM** — Better performance for frequent additions/deletions.

V8 optimizes plain objects for static shapes. When keys are added and removed dynamically (caches, counters, registries), `Map` provides consistently better performance.

```typescript
// Avoid for dynamic keys
const counts: Record<string, number> = {}
items.forEach(item => {
  counts[item.category] = (counts[item.category] || 0) + 1
})

// Prefer for dynamic keys
const counts = new Map<string, number>()
items.forEach(item => {
  counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
})
```

---

## 9. Use `toSorted()`, `toReversed()`, `toSpliced()` for Immutability

**Impact: LOW** — Correct immutability without manual copying.

The new non-mutating array methods avoid the `[...arr].sort()` pattern and communicate intent more clearly.

**Avoid — manual copy then mutate:**

```typescript
const sorted = [...items].sort((a, b) => a.price - b.price)
const reversed = [...items].reverse()
const without = [...items]; without.splice(index, 1)
```

**Prefer — non-mutating methods:**

```typescript
const sorted = items.toSorted((a, b) => a.price - b.price)
const reversed = items.toReversed()
const without = items.toSpliced(index, 1)
```

These are available in all modern browsers and Node.js 20+.
